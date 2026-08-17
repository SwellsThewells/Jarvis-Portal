/* =========================================================
   FIREBASE CONFIG — the only place this lives.
   Both index.html and imessage.html read from this file.

   Paste the object Firebase gives you at:
   Console -> Project settings (gear icon) -> General
          -> Your apps -> Web app -> Config

   Replace EVERY line below. Don't leave any of the
   placeholder text in place.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyC0R6_zrxWPh_2Fc5gdQQMOhS49lJhCg4I",
  authDomain: "jarvis-portal-fbdd9.firebaseapp.com",
  databaseURL: "https://jarvis-portal-fbdd9-default-rtdb.firebaseio.com",
  projectId: "jarvis-portal-fbdd9",
  storageBucket: "jarvis-portal-fbdd9.firebasestorage.app",
  messagingSenderId: "755013736889",
  appId: "1:755013736889:web:36b53575b35d1846717e68",
  measurementId: "G-37K0PNP7FZ"
};

/* -----------------------------------------------------------
   HEADS UP ON databaseURL

   Firebase often leaves databaseURL out of the config it shows
   you. If it's missing, create the Realtime Database first,
   then copy the URL from the top of the Realtime Database page.
   It looks like one of these, depending on the region you pick:

     https://your-project-default-rtdb.firebaseio.com
     https://your-project-default-rtdb.europe-west1.firebasedatabase.app

   Getting this wrong is the single most common reason messages
   silently fail to send.
   ----------------------------------------------------------- */

/* -----------------------------------------------------------
   USERNAME DOMAIN

   Firebase accounts are keyed by email, so usernames get turned
   into fake addresses behind the scenes. Nothing is ever sent
   to them; they only have to be unique.

   Pick this ONCE. Changing it later orphans every account that
   already exists — those people can never sign in again.
   ----------------------------------------------------------- */

const USER_DOMAIN = "@jarvisportal.local";
