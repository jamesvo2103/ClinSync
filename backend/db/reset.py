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


async def main():
    global collection

    trials = await trial_collection.find({}).to_list(length=None)
    if not trials:
        print("No trials found in MongoDB; nothing to index.")
        return

    # Drop and recreate so removed trials do not linger in the index.
    client.delete_collection(name=CHROMA_COLLECTION)
    collection = client.get_or_create_collection(name=CHROMA_COLLECTION)

    ids, documents, metadatas = [], [], []
    for trial in trials:
        trial_id = str(trial.pop("_id"))
        document, metadata = build_index_entry(trial, trial_id)
        ids.append(trial_id)
        documents.append(document)
        metadatas.append(metadata)

    collection.add(ids=ids, documents=documents, metadatas=metadatas)
    print(f"Indexed {len(ids)} trials into '{CHROMA_COLLECTION}' at {CHROMA_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
