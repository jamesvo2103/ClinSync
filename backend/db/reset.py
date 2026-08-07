"""Rebuild the ChromaDB trial index from MongoDB.

Run from the backend directory:  python -m db.reset

The index is derived data. Any trial in Mongo but missing here is invisible to
the matcher, so re-run this after restoring a database or changing the
embedding/collection settings.
"""
import asyncio

from db.connect import trial_collection
from db.vector_store import build_index_entry, client, collection
from config import CHROMA_COLLECTION, CHROMA_PATH


async def reindex(rebuild: bool = False) -> int:
    """Index every trial in MongoDB and return how many were written.

    With rebuild=True the collection is dropped first, so trials deleted from
    Mongo do not linger. That invalidates handles other modules already
    imported, so only the standalone script uses it; the startup path upserts
    into the live collection instead.
    """
    global collection

    trials = await trial_collection.find({}).to_list(length=None)
    if not trials:
        return 0

    if rebuild:
        client.delete_collection(name=CHROMA_COLLECTION)
        collection = client.get_or_create_collection(name=CHROMA_COLLECTION)

    ids, documents, metadatas = [], [], []
    for trial in trials:
        trial_id = str(trial.pop("_id"))
        document, metadata = build_index_entry(trial, trial_id)
        ids.append(trial_id)
        documents.append(document)
        metadatas.append(metadata)

    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)


async def ensure_index() -> int:
    """Populate the index on boot if it is empty, returning the count written.

    A hosted filesystem is usually ephemeral, so unless CHROMA_PATH points at a
    persistent disk the index is empty after every deploy and restart. An empty
    index makes the matcher return nothing at all rather than fail, so rebuild
    from Mongo before serving traffic.
    """
    if collection.count() > 0:
        return 0
    return await reindex()


async def main():
    indexed = await reindex(rebuild=True)
    if not indexed:
        print("No trials found in MongoDB; nothing to index.")
        return
    print(f"Indexed {indexed} trials into '{CHROMA_COLLECTION}' at {CHROMA_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
