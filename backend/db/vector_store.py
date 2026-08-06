"""Shared ChromaDB handle and the one definition of how a trial is indexed.

One client per process: opening several PersistentClient instances against the
same directory is unsupported and previously happened because the API layer and
the matching agent each built their own.
"""
import chromadb

from config import CHROMA_COLLECTION, CHROMA_PATH

client = chromadb.PersistentClient(path=CHROMA_PATH)
collection = client.get_or_create_collection(name=CHROMA_COLLECTION)


def build_index_entry(trial: dict, trial_id: str) -> tuple[str, dict]:
    """Return the (document, metadata) pair used to index one trial.

    Both writers go through this so the embedded text and the metadata the
    matcher relies on cannot drift apart. Chroma metadata values must be
    scalars, so the criteria list is flattened to a string.
    """
    criteria = trial.get("eligibilityCriteria") or []
    if isinstance(criteria, (list, tuple)):
        criteria_text = "; ".join(str(c) for c in criteria)
    else:
        criteria_text = str(criteria)

    document = "\n".join([
        f"Title: {trial.get('title', '')}",
        f"Description: {trial.get('description', '')}",
        f"Location: {trial.get('location', '')}",
        f"Eligibility criteria: {criteria_text}",
    ])
    metadata = {
        "trial_id": trial_id,
        "title": str(trial.get("title", "")),
        "eligibility": criteria_text,
        "location": str(trial.get("location", "")),
        "org_ID": str(trial.get("org_ID", "")),
    }
    return document, metadata
