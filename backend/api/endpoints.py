from fastapi import APIRouter, Depends, HTTPException, Query, Request
from api.auth import create_access_token, get_current_org
from db.connect import org_collection, user_collection, match_collection, trial_collection
from db.vector_store import build_index_entry, collection
from models.schema import Signup, Organization, Login, User, NewUser, Trial, Match, NewMatch, Volunteer
import bcrypt
from bson import ObjectId
from bson.errors import InvalidId
from google.api_core.exceptions import GoogleAPIError, ResourceExhausted
from agents.report_agent import report_graph_agent
from agents.matching_agent import matching_graph_agent
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def to_object_id(value: str, label: str) -> ObjectId:
    """Parse a path parameter into an ObjectId.

    Without this a malformed id raises InvalidId and surfaces as a 500; the
    caller sent a bad request, so report it as one.
    """
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label} id")

@router.get("/")
def get_root():
    return {"message": "Welcome to ClinSync!"}

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()

@router.post("/login-org")
async def login_org(org: Login):
    email = org.email
    password = org.password

    user = await org_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid information")
    
    if not bcrypt.checkpw(password.encode(), user["password"].encode()):
        raise HTTPException(status_code=400, detail="Invalid information")

    org_id = str(user["_id"])
    return {
        "name": user["name"],
        "email": user["email"],
        "id": org_id,
        "access_token": create_access_token(org_id, user["email"]),
        "token_type": "bearer",
    }


@router.post("/signup-org")
async def signup_org(org: Signup):
    existing_user = await org_collection.find_one({"email": org.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already exists.")

    hashed_password = hash_password(org.password)

    new_org = Organization(
        name=org.name,
        password=hashed_password,
        email=org.email,
        trials=[]
    ).dict()

    result = await org_collection.insert_one(new_org)
    org_id = str(result.inserted_id)
    return {
        "name": org.name,
        "email": org.email,
        "id": org_id,
        "access_token": create_access_token(org_id, org.email),
        "token_type": "bearer",
    }

# @router.post("/create-user")
async def create_user(user: User):
    existing_user = await user_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already exists.")
    
    new_user = User(
        name=user.name,
        email=user.email,
        report=user.report
    ).dict()
    result = await user_collection.insert_one(new_user)
    return {"message": "Create successful", "id": str(result.inserted_id)}
    
@router.post("/trials")
async def create_trial(trial: Trial, org=Depends(get_current_org)):
    # Titles only need to be unique within the organisation that owns them;
    # a global check let one organisation block another's title.
    existing_trial = await trial_collection.find_one(
        {"title": trial.title, "org_ID": org["id"]}
    )
    if existing_trial:
        raise HTTPException(
            status_code=409, detail="Your organization already has a trial with that title."
        )

    new_trial = trial.dict()
    # Ownership comes from the token, never from the request body.
    new_trial["org_ID"] = org["id"]
    result = await trial_collection.insert_one(new_trial)
    trial_id = str(result.inserted_id)

    # insert_one injects a non-serialisable _id into the dict it was given.
    new_trial.pop("_id", None)
    document, metadata = build_index_entry(new_trial, trial_id)
    collection.add(ids=[trial_id], documents=[document], metadatas=[metadata])
    return {**new_trial, "id": trial_id}
    
@router.get("/orgs/{org_id}")
async def get_trials_for_org(org_id: str, org=Depends(get_current_org)):
    if org_id != org["id"]:
        raise HTTPException(status_code=403, detail="Not your organization")

    org_exists = await org_collection.find_one({"_id": to_object_id(org_id, "organization")})
    if not org_exists:
        raise HTTPException(status_code=404, detail="Organization not found")

    trials_cursor = trial_collection.find({"org_ID": org_id})
    trials = await trials_cursor.to_list(length=None)


    for trial in trials:
        trial["_id"] = str(trial["_id"])

    return {
        "organization_id": org_id,
        "trials": trials
    }

async def run_graph(graph, state, stage: str):
    """Run a compiled LangGraph off the event loop, mapping failures to 5xx.

    graph.invoke() is synchronous and spends ~20s in network calls; running it
    directly in the request coroutine blocks the event loop and freezes every
    other request for the duration.
    """
    try:
        return await asyncio.to_thread(graph.invoke, state)
    except ResourceExhausted as exc:
        logger.warning("%s stage hit the model provider quota: %s", stage, exc)
        raise HTTPException(
            status_code=503,
            detail="The AI service is rate limited right now. Please try again in a minute.",
        )
    except GoogleAPIError as exc:
        logger.exception("%s stage failed calling the model provider", stage)
        raise HTTPException(
            status_code=503,
            detail="The AI service is temporarily unavailable. Please try again.",
        )


@router.post("/users/")
async def volunteer_submission(user: Volunteer):
    # Reject a duplicate before the ~20s AI pipeline rather than after it. The
    # check inside create_user still guards the race, but hitting it there meant
    # the volunteer waited for a report that was then thrown away.
    if await user_collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already exists.")

    report_graph = report_graph_agent.compile()
    initial_state = {
        "originalInfo": user,
        "cleanedInfo": "",
        "critique_count": 0,
        "redo_clean": False,
        "report_text": ""
    }
    state = await run_graph(report_graph, initial_state, "report")
    cleaned_info = state.get("cleanedInfo")
    report_text = state.get("report_text")
    updated_user = user.dict()
    updated_user["cleanedInfo"] = cleaned_info
    user_to_create = User(
        name=user.name,
        email=user.email,
        report=report_text
    )
    user = await create_user(user_to_create)
    new_state = {
        "volunteerInfo": updated_user,
        "report_text": report_text,
        "candidates": [],
        "matches_id": [],
        "matches_documents": [],
        "screening": [],
        "explanation": ""
    }
    # The volunteer record is already saved at this point. If matching fails,
    # report the submission as successful with no matches rather than raising:
    # a 5xx here told the volunteer their application failed while their record
    # existed, so retrying only produced a duplicate-email error.
    matching_graph = matching_graph_agent.compile()
    try:
        final_state = await run_graph(matching_graph, new_state, "matching")
        matched_ids = final_state.get("matches_id") or []
        explanation = final_state.get("explanation") or ""
    except HTTPException:
        logger.exception("matching failed after volunteer %s was saved", user["id"])
        matched_ids = []
        explanation = (
            "Your application was received, but trial matching is temporarily "
            "unavailable. A coordinator will follow up."
        )

    return {
        "message": "Volunteer Submission",
        "matches": matched_ids,
        "explanation": explanation,
        "id": str(user["id"])
    }

@router.post("/matches")
async def create_match(newMatch: NewMatch):
    trial_id = newMatch.trial_id
    user_id = newMatch.user_id

    trial = await trial_collection.find_one({"_id": to_object_id(trial_id, "trial")})
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")

    user = await user_collection.find_one({"_id": to_object_id(user_id, "user")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_match = await match_collection.find_one({"trial_id": trial_id, "user_id": user_id})
    if existing_match:
        raise HTTPException(status_code=409, detail="Match already exists")

    match_doc = Match(trial_id=trial_id, user_id=user_id, status="pending").dict()
    result = await match_collection.insert_one(match_doc)
    return {"message": "Match created", "id": str(result.inserted_id)}


async def assert_owns_trial(trial_id: str, org_id: str) -> dict:
    """Fetch a trial, refusing if it belongs to another organisation."""
    trial = await trial_collection.find_one({"_id": to_object_id(trial_id, "trial")})
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    if trial.get("org_ID") != org_id:
        raise HTTPException(status_code=403, detail="Not your trial")
    return trial


@router.get("/trials/{trial_id}")
async def get_match_for_trial(trial_id: str, org=Depends(get_current_org)):
    await assert_owns_trial(trial_id, org["id"])
    matches_cursor = match_collection.find({"trial_id": trial_id})
    matches = await matches_cursor.to_list(length=None)  
    result = [
        {
            "user_id": match.get("user_id"), 
            "match_id": str(match.get("_id")),
            "status": match.get("status", "pending")  
        } 
        for match in matches
    ]
    return {"message": "Get Users for Trial", "matches": result}

async def set_match_status(match_id: str, org_id: str, status_value: str) -> dict:
    oid = to_object_id(match_id, "match")
    match = await match_collection.find_one({"_id": oid})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    await assert_owns_trial(match["trial_id"], org_id)
    await match_collection.update_one({"_id": oid}, {"$set": {"status": status_value}})
    return match


@router.post("/approve/{match_id}")
async def approve(match_id: str, org=Depends(get_current_org)):
    await set_match_status(match_id, org["id"], "approved")
    return {"message": f"Approved Match {match_id}"}


@router.post("/reject/{match_id}")
async def reject(match_id: str, org=Depends(get_current_org)):
    await set_match_status(match_id, org["id"], "rejected")
    return {"message": f"Rejected Match {match_id}"}

@router.get("/users/{user_id}")
async def get_user(user_id: str, org=Depends(get_current_org)):
    # This record contains the volunteer's AI medical report. Only an
    # organisation that has a match linking one of its own trials to this
    # volunteer may read it.
    own_trials = await trial_collection.find(
        {"org_ID": org["id"]}, {"_id": 1}
    ).to_list(length=None)
    own_trial_ids = [str(t["_id"]) for t in own_trials]
    linking_match = await match_collection.find_one(
        {"user_id": user_id, "trial_id": {"$in": own_trial_ids}}
    )
    if not linking_match:
        raise HTTPException(status_code=403, detail="Not a volunteer for your trials")

    user = await user_collection.find_one({"_id": to_object_id(user_id, "user")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_without_id = user.copy()
    del user_without_id["_id"]
    return {"message": "Get User", "user": user_without_id}

@router.get("/trials/{trial_id}/info")
async def get_trial(trial_id: str):
    trial = await trial_collection.find_one({"_id": to_object_id(trial_id, "trial")})
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    trial_without_id = trial.copy()
    del trial_without_id["_id"]
    return {"message": "Get Trial", "user": trial_without_id}