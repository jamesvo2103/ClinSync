import motor.motor_asyncio

from config import MONGODB_URL

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL, tls=True)
db = client.revuc

org_collection = db.get_collection("organizations")
user_collection = db.get_collection("users")
trial_collection = db.get_collection("trials")
match_collection = db.get_collection("matches")
