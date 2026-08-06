import json
import logging
from typing import TypedDict

from langgraph.graph import END, StateGraph
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from models.schema import Volunteer

from config import GEMINI_MODEL, MATCH_CANDIDATES, MAX_MATCH_DISTANCE, MAX_MATCHES
from db.vector_store import collection

logger = logging.getLogger(__name__)

model = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)


class AgentState(TypedDict):
    volunteerInfo: Volunteer
    report_text: str
    candidates: list[dict]
    matches_id: list[str]
    matches_documents: list[str]
    screening: list[dict]
    explanation: str


def matching_node(state: AgentState):
    """Retrieve candidate trials by semantic similarity, dropping weak hits.

    Vector distance alone cannot judge eligibility - it only finds trials whose
    text reads like the volunteer's. It is a shortlist, not a decision.
    """
    volunteerInfo = state.get("volunteerInfo", "")
    if collection.count() == 0:
        return {"candidates": []}

    result = collection.query(
        query_texts=[str(volunteerInfo)],
        n_results=min(MATCH_CANDIDATES, collection.count()),
        include=["distances", "documents", "metadatas"],
    )

    candidates = []
    for trial_id, document, metadata, distance in zip(
        result["ids"][0],
        result["documents"][0],
        result["metadatas"][0] or [{}] * len(result["ids"][0]),
        result["distances"][0],
    ):
        # Beyond this distance the trial is unrelated to the volunteer, and
        # returning it as a "match" wastes a coordinator's time.
        if distance > MAX_MATCH_DISTANCE:
            continue
        candidates.append({
            "id": trial_id,
            "document": document,
            "distance": distance,
            "title": (metadata or {}).get("title", ""),
            "eligibility": (metadata or {}).get("eligibility", ""),
        })

    return {"candidates": candidates}


def _parse_screening(raw: str) -> list[dict]:
    """Pull the JSON array out of a model reply, tolerating code fences."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("no JSON array in reply")
    return json.loads(text[start : end + 1])


def eligibility_node(state: AgentState):
    """Screen each shortlisted trial against its own eligibility criteria.

    One call covering every candidate rather than one per trial: the free tier
    allows few requests, and a per-trial loop multiplied cost by the shortlist
    size for no extra accuracy.
    """
    volunteerInfo = state.get("volunteerInfo", "")
    candidates = state.get("candidates", [])
    if not candidates:
        return {"matches_id": [], "matches_documents": [], "screening": []}

    listing = "\n\n".join(
        f"[{i}] Title: {c['title']}\nEligibility criteria: {c['eligibility'] or 'not specified'}"
        for i, c in enumerate(candidates)
    )

    SCREEN_PROMPT = (
        "You screen a clinical trial volunteer against each trial's eligibility "
        "criteria. For every trial decide one verdict:\n"
        "  'eligible'   - the record satisfies the stated criteria\n"
        "  'ineligible' - the record clearly contradicts a stated criterion\n"
        "  'unknown'    - the record lacks the information needed to decide\n"
        "Judge only against the criteria given. Never assume a detail the "
        "volunteer record does not state; that is 'unknown', not 'eligible'. "
        "Reply with a JSON array only, one object per trial, each with keys "
        "'index' (integer), 'verdict' (string) and 'reason' (one short sentence)."
    )

    messages = [
        SystemMessage(SCREEN_PROMPT),
        HumanMessage(f"Volunteer record:\n{volunteerInfo}\n\nTrials:\n{listing}"),
    ]

    try:
        verdicts = _parse_screening(model.invoke(messages).content)
    except (ValueError, json.JSONDecodeError) as exc:
        # An unreadable screening reply must not silently drop every trial.
        # Fall back to the unscreened shortlist and say so.
        logger.warning("eligibility screening returned unusable output: %s", exc)
        kept = candidates[:MAX_MATCHES]
        return {
            "matches_id": [c["id"] for c in kept],
            "matches_documents": [c["document"] for c in kept],
            "screening": [],
        }

    by_index = {}
    for verdict in verdicts:
        try:
            by_index[int(verdict.get("index"))] = verdict
        except (TypeError, ValueError):
            continue

    screening, kept = [], []
    for i, candidate in enumerate(candidates):
        verdict = by_index.get(i, {})
        decision = str(verdict.get("verdict", "unknown")).strip().lower()
        record = {
            "id": candidate["id"],
            "title": candidate["title"],
            "verdict": decision,
            "reason": str(verdict.get("reason", "")),
        }
        screening.append(record)
        # Keep 'unknown': missing information is a question for the coordinator,
        # not grounds for silently excluding the volunteer.
        if decision != "ineligible":
            kept.append(candidate)

    kept = kept[:MAX_MATCHES]
    return {
        "matches_id": [c["id"] for c in kept],
        "matches_documents": [c["document"] for c in kept],
        "screening": screening,
    }


def explanation_node(state: AgentState):
    matches_documents = state.get("matches_documents", [])
    if not matches_documents:
        return {"explanation": "No open trials currently match this volunteer."}

    volunteerInfo = state.get("volunteerInfo", "")
    screening = state.get("screening", [])
    kept_ids = set(state.get("matches_id", []))
    notes = "\n".join(
        f"- {s['title']}: {s['verdict']} - {s['reason']}"
        for s in screening
        if s["id"] in kept_ids
    )

    EXPLANATION_PROMPT = (
        "Explain to the volunteer why each trial was matched, referring only to "
        "details present in their record and the trial text. Never invent "
        "eligibility details. Where their record is missing something a trial "
        "requires, say so plainly and note that a coordinator will confirm it. "
        "Keep it to a short paragraph per trial.\n\n"
        "Volunteer record: {volunteerInfo}"
    )
    USER_PROMPT = "Trials:\n{trials}"
    if notes:
        USER_PROMPT += "\n\nScreening notes:\n{notes}"

    messages = [
        SystemMessage(EXPLANATION_PROMPT.format(volunteerInfo=volunteerInfo)),
        HumanMessage(USER_PROMPT.format(trials="\n\n".join(matches_documents), notes=notes)),
    ]
    return {"explanation": model.invoke(messages).content}


matching_graph_agent = StateGraph(AgentState)
matching_graph_agent.add_node("match", matching_node)
matching_graph_agent.add_node("screen", eligibility_node)
matching_graph_agent.add_node("explain", explanation_node)
matching_graph_agent.set_entry_point("match")
matching_graph_agent.add_edge("match", "screen")
matching_graph_agent.add_edge("screen", "explain")
matching_graph_agent.add_edge("explain", END)
