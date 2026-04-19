import * as admin from 'firebase-admin';
import { GeoFirestore } from 'geofirestore';

const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

let credential;
if (credentialPath) {
  credential = admin.credential.cert(credentialPath);
} else if (credentialJson) {
  try {
    const jsonStr = Buffer.from(credentialJson, 'base64').toString('utf8');
    credential = admin.credential.cert(JSON.parse(jsonStr));
  } catch (error) {
    console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', error);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: credential,
  });
}

const db = admin.firestore();
const geoFirestore = new GeoFirestore(db);

export { db, geoFirestore };
