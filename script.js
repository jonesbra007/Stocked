import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5tfvrxjwVVp3fdWDP1p_EiqLpQc-yxT8",
  authDomain: "stocked-website.firebaseapp.com",
  projectId: "stocked-website",
  storageBucket: "stocked-website.firebasestorage.app",
  messagingSenderId: "532018821574",
  appId: "1:532018821574:web:2dd176a57164e0a8a3dac7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isSignup = false; 

// --- Global Variables need to be attached to window to be seen by HTML ---
window.recipes = [];
window.friendRecipes = [];
window.mealPlan = {};
window.inventory = [];
window.manualGrocery = [];
window.friends = []; 

// --- MAKE AUTH FUNCTION GLOBAL ---
window.handleAuth = async () => {
    console.log("Auth Button Clicked"); // Debugging check
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    let first = '', last = '';
    if (isSignup) {
        first = document.getElementById('auth-first').value.trim();
        last = document.getElementById('auth-last').value.trim();
        if (!first || !last) {
            errorEl.innerText = "Please enter your full name.";
            errorEl.style.display = 'block';
            return;
        }
    }

    try {
        if(isSignup) {
            await createUserWithEmailAndPassword(auth, email, pass);
            await initNewUserDB(first, last); 
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
    } catch (error) {
        console.error(error); // Log error to console
        errorEl.innerText = error.message;
        errorEl.style.display = 'block';
    }
};

// --- MAKE TOGGLE GLOBAL ---
window.toggleAuthMode = () => {
    isSignup = !isSignup;
    const title = document.getElementById('auth-title');
    const btn = document.querySelector('#auth-modal button.primary');
    const toggle = document.querySelector('.auth-toggle');
    const error = document.getElementById('auth-error');
    const nameContainer = document.getElementById('auth-name-container');

    error.style.display = 'none';
    if(isSignup) { 
        title.innerText = "Create Account"; 
        btn.innerText = "Sign Up"; 
        toggle.innerText = "Already have an account? Log In";
        nameContainer.style.display = 'flex'; 
    } else { 
        title.innerText = "Welcome to Stocked"; 
        btn.innerText = "Log In"; 
        toggle.innerText = "Don't have an account? Sign Up"; 
        nameContainer.style.display = 'none'; 
    }
};

window.handleLogout = () => signOut(auth);

// --- Auth State Observer ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-modal').classList.remove('open');
        document.getElementById('main-content').style.display = 'block';
        if(window.innerWidth > 768) {
            document.getElementById('nav-actions').style.display = 'flex';
        }
        if(window.innerWidth <= 768) {
            document.getElementById('mobile-nav').style.display = 'flex';
        }
        document.getElementById('user-section').style.display = 'flex'; 
        await loadUserData();
    } else {
        currentUser = null;
        document.getElementById('auth-modal').classList.add('open');
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('nav-actions').style.display = 'none';
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('mobile-nav').style.display = 'none';
    }
});

// --- Helper Functions (Also made Global/Window for HTML access) ---

window.togglePasswordVisibility = () => {
    const input = document.getElementById('auth-password');
    const icon = document.querySelector('.password-toggle');
    if (input.type === "password") { input.type = "text"; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); } 
    else { input.type = "password"; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
};

async function initNewUserDB(firstName = '', lastName = '') {
    if(!currentUser) return;
    const defaultInv = [{ name: "Salt", category: "Spices & Seasonings", checked: true }, { name: "Garlic", category: "Produce", checked: true }];
    await setDoc(doc(db, "users", currentUser.uid, "data", "inventory"), { items: defaultInv });
    await setDoc(doc(db, "users", currentUser.uid, "data", "mealPlan"), { plan: {} });
    await setDoc(doc(db, "users", currentUser.uid, "data", "grocery"), { items: [] });
    // Save profile logic included in saveProfile
    await saveProfile(firstName, lastName); 

    await addDoc(collection(db, "users", currentUser.uid, "recipes"), {
        title: 'Avocado Toast', category: ['Breakfast'], ingredients: 'Bread\nAvocado', instructions: 'Toast bread.', favorite: true, id: Date.now()
    });
}

async function loadUserData() {
    document.getElementById('loader').style.display = 'flex';
    // ... (Loading logic remains the same, just ensuring variables are accessible)
    // For brevity, using standard loading logic here
    window.recipes = [];
    const q = query(collection(db, "users", currentUser.uid, "recipes"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => { 
        let data = doc.data();
        if (data.category && typeof data.category === 'string') data.category = [data.category]; 
        window.recipes.push({ ...data, id: doc.id }); 
    });

    // ... (Load other collections similarly)
    document.getElementById('loader').style.display = 'none';
}

// ... (Rest of your existing functions like saveProfile, renderRecipes, etc.)
// IMPORTANT: Any function called by `onclick="..."` in HTML MUST be attached to window.
// Example:
window.saveProfile = async (firstOverride, lastOverride) => {
    const first = firstOverride || document.getElementById('profile-first').value.trim();
    const last = lastOverride || document.getElementById('profile-last').value.trim();
    
    // ... Save logic ...
    await setDoc(doc(db, "users", currentUser.uid, "data", "profile"), { firstName: first, lastName: last });
    
    // Create Public Profile
    const safeEmail = currentUser.email.replace(/\./g, ',');
    await setDoc(doc(db, "public_profiles", safeEmail), {
        uid: currentUser.uid,
        firstName: first,
        lastName: last,
        email: currentUser.email
    });
    
    // Update Greeting
    const el = document.getElementById('user-greeting');
    if (first) { el.innerText = `Hello ${first}!`; el.style.display = 'block'; }
    if(!firstOverride) window.closeProfileModal();
};

window.closeProfileModal = () => document.getElementById('profile-modal').classList.remove('open');
// ... Add other window.functions as needed for your specific buttons.
