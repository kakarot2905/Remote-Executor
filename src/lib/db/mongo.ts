/** MongoDB client (shared, lazily initialized). */

import { MongoClient, Db } from "mongodb";
import { config } from "../config";

let client: MongoClient | null = null;
let db: Db | null = null;

const connect = async () => {
  if (client && db) return { client, db };

  client = new MongoClient(config.mongodbUri, {
    serverSelectionTimeoutMS: 5_000,
    retryWrites: true,
  });

  await client.connect();
  db = client.db(config.mongodbDb);
  return { client, db };
};

export const getMongoClient = async (): Promise<MongoClient> => {
  const { client: c } = await connect();
  return c;
};

export const getMongoDb = async (): Promise<Db> => {
  const { db: d } = await connect();
  return d;
};

export const mongoCollections = {
  jobs: "jobs",
  workers: "workers",
  logs: "jobLogs",
  heartbeats: "heartbeats",
};
