
import { firebaseConfig } from './firebase.js';
import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence);

// Admin matriculas
export const ADMIN_MATRICULAS = ['4144','70029','6266'];

// Helpers
export const buildEmail = (matricula) => `${matricula}@movebuss.local`;

// Registration
export async function registerUser({ matricula, nome, senha }){
  const email = buildEmail(matricula);
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  const role = ADMIN_MATRICULAS.includes(matricula) ? 'admin' : 'user';
  // Save profile in Firestore
  await setDoc(doc(db,'users', cred.user.uid), {
    uid: cred.user.uid,
    email, matricula, nome, role,
    createdAt: new Date().toISOString()
  });
  return cred.user;
}

// Login
export async function loginWithMatricula({ matricula, senha }){
  const email = buildEmail(matricula);
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

// Change password (reauth)
export async function changePassword(currentPassword, newPassword){
  const user = auth.currentUser;
  if(!user) throw new Error('Usuário não autenticado');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

// Get role/profile
export async function getProfile(){
  const user = auth.currentUser;
  if(!user) return null;
  const snap = await getDoc(doc(db,'users', user.uid));
  return snap.exists() ? snap.data() : null;
}

