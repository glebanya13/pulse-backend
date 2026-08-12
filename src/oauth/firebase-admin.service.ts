import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';

/**
 * Thin wrapper around firebase-admin. Initialized only when credentials are
 * present — otherwise Google/Apple login endpoints return 503, same as
 * unconfigured Yandex/VK.
 *
 * We use Firebase Auth solely as an IdP (verify the client's ID token). User
 * profiles, chats, events, etc. live in our Postgres on the RF VPS — never in
 * Firestore.
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private ready = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length > 0) {
      this.ready = true;
      return;
    }

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    // Private keys in .env often keep literal `\n` — normalize to real newlines.
    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    const path =
      this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;

    try {
      if (path && fs.existsSync(path)) {
        const sa = JSON.parse(
          fs.readFileSync(path, 'utf8'),
        ) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        this.ready = true;
        this.logger.log(`Firebase Admin initialized from ${path}`);
      } else if (json) {
        const sa = JSON.parse(json) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        this.ready = true;
      } else if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.ready = true;
      } else {
        this.logger.warn(
          'Firebase Admin not configured — Google/Apple login disabled (set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)',
        );
      }
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
      this.ready = false;
    }
  }

  isConfigured() {
    return this.ready;
  }

  verifyIdToken(idToken: string) {
    return admin.auth().verifyIdToken(idToken);
  }

  /** Best-effort Firebase Auth user delete (never throws). */
  async deleteUser(uid: string): Promise<void> {
    if (!this.ready) return;
    try {
      await admin.auth().deleteUser(uid);
      this.logger.log(`Firebase Auth user deleted: ${uid}`);
    } catch (err) {
      this.logger.warn(`Firebase deleteUser failed for ${uid}: ${err}`);
    }
  }

  /**
   * Best-effort FCM data+notification message. Never throws to callers —
   * push must not break in-app notification creation.
   */
  async sendToDevice(params: {
    token: string;
    title: string;
    body?: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    if (!this.ready) return false;
    try {
      await admin.messaging().send({
        token: params.token,
        notification: {
          title: params.title,
          body: params.body,
        },
        data: params.data,
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });
      return true;
    } catch (err) {
      this.logger.warn(`FCM send failed: ${err}`);
      return false;
    }
  }
}
