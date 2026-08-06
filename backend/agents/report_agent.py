from typing import TypedDict
from langgraph.graph import StateGraph
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from models.schema import Volunteer
from langgraph.graph import END

from config import GEMINI_MODEL

model = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

# These prompts describe a medical record. Never invite the model to supply
# missing details: a fabricated condition or medication reads as fact to the
# coordinator screening the volunteer.
NO_FABRICATION = (
    "Use only the information given. Never invent, infer, or fill in missing "
    "values. If a field is absent or unclear, write 'not provided'."
)

MAX_CRITIQUE_ROUNDS = 2


class AgentState(TypedDict):
    originalInfo: Volunteer
    cleanedInfo: str
    critique_text: str
    report_text: str
    critique_count: int
    redo_clean: bool

def clean_node(state: AgentState):
    originalInfo = state.get("originalInfo", "")
    critique = state.get("critique_text", "")

    CLEAN_PROMPT = (
        "You normalise volunteer intake data extracted from PDFs and images. "
        "Reformat it into a clear structured list, correcting only formatting, "
        "spacing, casing and obvious transcription artefacts. "
        + NO_FABRICATION
    )
    USER_PROMPT = "Clean the following raw data into a structured list format: {info}"
    if critique:
        USER_PROMPT += "\n\nA previous attempt drew this critique; address it:\n{critique}"

    messages = [
        SystemMessage(CLEAN_PROMPT),
        HumanMessage(USER_PROMPT.format(info=originalInfo, critique=critique)),
    ]
    response = model.invoke(messages)
    return {"cleanedInfo": response.content}


def critique_node(state: AgentState):
    """Judge the cleaned data. Never writes to cleanedInfo.

    The critique is commentary *about* the record, not a replacement for it.
    Storing it in cleanedInfo (as this node used to on the success path) fed the
    commentary to report_node in place of the volunteer, which then invented the
    medical details it could no longer see.
    """
    originalInfo = state.get("originalInfo", "")
    cleanedInfo = state.get("cleanedInfo", "")
    critique_count = state.get("critique_count", 0)

    CRITIQUE_PROMPT = (
        "You check normalised volunteer intake data against the original. "
        "Report any value that was altered, dropped, or added relative to the "
        "original, and any remaining formatting problem. "
        "Reply with the single word CLEAN on the first line if the data "
        "faithfully represents the original; otherwise begin with NEEDS WORK "
        "and list what to redo."
    )
    USER_PROMPT = "Original:\n{original}\n\nCleaned:\n{cleaned}"

    messages = [
        SystemMessage(CRITIQUE_PROMPT),
        HumanMessage(USER_PROMPT.format(original=originalInfo, cleaned=cleanedInfo)),
    ]
    response = model.invoke(messages)
    content = response.content

    return {
        "critique_text": content,
        "critique_count": critique_count + 1,
        "redo_clean": not content.strip().upper().startswith("CLEAN"),
    }


def report_node(state: AgentState):
    cleanedInfo = state.get("cleanedInfo", "")
    originalInfo = state.get("originalInfo", "")

    REPORT_PROMPT = (
        "You write a concise medical summary of a clinical trial volunteer for "
        "the coordinator screening them. Cover demographics, medical "
        "conditions, medications, allergies and past surgeries. "
        + NO_FABRICATION
        + " Do not comment on data quality or formatting; describe the volunteer."
    )
    USER_PROMPT = (
        "Write the volunteer summary.\n\n"
        "Submitted record:\n{original}\n\nNormalised record:\n{cleaned}"
    )
    messages = [
        SystemMessage(REPORT_PROMPT),
        HumanMessage(USER_PROMPT.format(original=originalInfo, cleaned=cleanedInfo)),
    ]
    response = model.invoke(messages)
    return {"report_text": response.content}


def should_continue(state: AgentState):
    # critique_node has already incremented the counter, so compare against the
    # round limit rather than 0 - the old `< 1` test could never be true and
    # made this edge dead code.
    if state.get("redo_clean", False) and state.get("critique_count", 0) < MAX_CRITIQUE_ROUNDS:
        return "clean"
    return "report"

report_graph_agent = StateGraph(AgentState)

report_graph_agent.add_node("clean", clean_node)
report_graph_agent.add_node("critique", critique_node)
report_graph_agent.add_node("report", report_node)

report_graph_agent.set_entry_point("clean")
report_graph_agent.add_edge("clean", "critique")
report_graph_agent.add_conditional_edges(
    "critique",
    should_continue,
)
report_graph_agent.add_edge("report", END)

