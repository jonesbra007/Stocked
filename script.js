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

let recipes = [];
let friendRecipes = []; 
let mealPlan = {};
let inventory = [];
let manualGrocery = [];
let friends = []; 

const PRESET_COLORS = [
    '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', 
    '#3498DB', '#9B59B6', '#E91E63', '#34495E', '#A2D729'
];
let selectedColor = PRESET_COLORS[0];

let appCategories = [
    { name: "Italian", color: "#E74C3C" }, 
    { name: "Mexican", color: "#2ECC71" }, 
    { name: "Asian", color: "#E67E22" },    
    { name: "American", color: "#3498DB" },
    { name: "Healthy", color: "#A2D729" }, 
    { name: "Breakfast", color: "#F1C40F"},
    { name: "Dessert", color: "#E91E63" }, 
    { name: "Other", color: "#34495E" }     
];
let userProfile = { firstName: '', lastName: '' };
let isDarkMode = false;

const INVENTORY_CATEGORIES = ["Produce", "Meat & Protein", "Dairy & Fridge", "Pantry & Grains", "Spices & Seasonings", "Other"];
const CATEGORY_KEYWORDS = {
    "Produce": ["onion", "garlic", "lemon", "lime", "tomato", "potato", "carrot", "lettuce", "spinach", "pepper", "fruit", "veg", "avocado", "banana", "herb", "cilantro", "parsley", "basil", "chive"],
    "Meat & Protein": ["chicken", "beef", "pork", "steak", "fish", "salmon", "tuna", "shrimp", "tofu", "meat", "bacon", "sausage", "turkey", "ham"],
    "Dairy & Fridge": ["milk", "cheese", "butter", "egg", "cream", "yogurt", "cheddar", "mozzarella", "parmesan"],
    "Pantry & Grains": ["rice", "pasta", "noodle", "bread", "flour", "sugar", "cereal", "oat", "can", "bean", "lentil", "sauce", "jar", "honey", "nut"],
    "Spices & Seasonings": ["salt", "pepper", "oil", "vinegar", "spice", "paprika", "cumin", "soy", "seasoning"]
};

let currentDashboardFilter = "All";
let currentPickerFilter = "All";
let currentSearchQuery = "";
let searchTimeout = null;
let activeSlot = { day: null, type: null };
let wakeLock = null;
let confirmCallback = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 65%, 60%)`; 
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        isDarkMode = true;
        document.body.setAttribute('data-theme', 'dark');
    }
    updateDarkModeIcon();
}

window.toggleDarkMode = () => {
    isDarkMode = !isDarkMode;
    if (isDarkMode) {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
    updateDarkModeIcon();
};

function updateDarkModeIcon() {
    const icon = document.getElementById('dark-mode-icon');
    if (isDarkMode) {
        icon.className = 'fas fa-toggle-on';
        icon.style.color = 'var(--primary)';
    } else {
        icon.className = 'fas fa-toggle-off';
        icon.style.color = 'var(--text-light)';
    }
}

initTheme();

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
        initCustomSelects();
        initColorPicker();
    } else {
        currentUser = null;
        document.getElementById('auth-modal').classList.add('open');
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('nav-actions').style.display = 'none';
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('mobile-nav').style.display = 'none';
    }
});

// --- Voice Dictation ---
let recognition = null;
let activeInputId = null;
let activeMicBtn = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        if(activeMicBtn) activeMicBtn.classList.add('listening');
    };

    recognition.onend = function() {
        if(activeMicBtn) activeMicBtn.classList.remove('listening');
        activeInputId = null;
        activeMicBtn = null;
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        if(activeInputId) {
            const input = document.getElementById(activeInputId);
            if(input.value.length > 0) input.value += ' ' + transcript;
            else input.value = transcript;
        }
    };
}

window.toggleDictation = (inputId, btnElement) => {
    if (!recognition) {
        alert("Your browser does not support speech recognition. Please use Chrome or Safari.");
        return;
    }
    if (activeInputId === inputId) {
        recognition.stop(); 
    } else {
        activeInputId = inputId;
        activeMicBtn = btnElement;
        recognition.start();
    }
};

function initColorPicker() {
    const container = document.getElementById('color-picker-container');
    container.innerHTML = '';
    PRESET_COLORS.forEach((color, idx) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        if(idx === 0) swatch.classList.add('selected'); // Select first by default
        swatch.onclick = () => {
            document.querySelectorAll('#color-picker-container .color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            selectedColor = color;
        };
        container.appendChild(swatch);
    });
}

window.toggleSettingsMenu = () => {
    const menu = document.getElementById('settings-dropdown');
    menu.classList.toggle('show');
};

window.addEventListener('click', function(e) {
    if (!e.target.closest('.settings-btn') && !e.target.closest('.settings-dropdown')) {
        document.getElementById('settings-dropdown').classList.remove('show');
    }
    // Close edit color popup
    if (!e.target.closest('.cat-color-dot') && !e.target.closest('#edit-color-popup')) {
        document.getElementById('edit-color-popup').style.display = 'none';
    }
});

window.openProfileModal = () => {
    document.getElementById('profile-first').value = userProfile.firstName || '';
    document.getElementById('profile-last').value = userProfile.lastName || '';
    document.getElementById('profile-modal').classList.add('open');
    document.getElementById('settings-dropdown').classList.remove('show');
};
window.closeProfileModal = () => document.getElementById('profile-modal').classList.remove('open');

window.saveProfile = async () => {
    const first = document.getElementById('profile-first').value.trim();
    const last = document.getElementById('profile-last').value.trim();
    userProfile = { firstName: first, lastName: last };
    
    document.getElementById('loader').style.display = 'flex';
    await setDoc(doc(db, "users", currentUser.uid, "data", "profile"), userProfile);
    
    // Create Public Profile for Friend Finding
    const safeEmail = currentUser.email.replace(/\./g, ',');
    await setDoc(doc(db, "public_profiles", safeEmail), {
        uid: currentUser.uid,
        firstName: first,
        lastName: last,
        email: currentUser.email
    });

    document.getElementById('loader').style.display = 'none';
    renderGreeting();
    closeProfileModal();
};

function renderGreeting() {
    const el = document.getElementById('user-greeting');
    if (userProfile.firstName) {
        el.innerText = `Hello ${userProfile.firstName}!`;
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// --- V.54 Logic: Recipe Multiplier (Restored) ---
window.updateMultiplier = (el, change) => {
    const badge = el.closest('.multiplier-badge');
    const valSpan = badge.querySelector('.mult-val');
    let current = parseFloat(valSpan.innerText);
    
    let newVal = current + change;
    if(newVal < 0.5) newVal = 0.5; 
    if(newVal > 10) newVal = 10;      
    
    valSpan.innerText = newVal + 'x';
    
    const card = el.closest('.recipe-card');
    const list = card.querySelector('.ingredient-list');
    const originalText = decodeURIComponent(list.dataset.original);
    
    list.innerHTML = formatScaledIngredients(originalText, newVal);
    
    const rId = card.dataset.id;
    const rIndex = recipes.findIndex(r => r.id == rId);
    if(rIndex > -1) {
        recipes[rIndex].currentMultiplier = newVal;
    }
};

function safeParseFraction(str) {
    if(!str.includes('/')) return parseFloat(str);
    const [num, den] = str.split('/').map(Number);
    return den ? num / den : 0;
}

function formatScaledIngredients(text, multiplier) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(line => {
        if(!line.trim()) return '';
        // Simple regex to catch numbers and scale them
        const scaledLine = line.replace(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)/, (match) => {
            let num = 0;
            if(match.includes(' ')) { 
                const parts = match.split(' ');
                num = parseFloat(parts[0]) + safeParseFraction(parts[1]);
            } else if(match.includes('/')) { 
                num = safeParseFraction(match);
            } else { 
                num = parseFloat(match);
            }
            
            let result = num * multiplier;
            
            // Format nice string
            if(Math.abs(result - Math.round(result)) < 0.05) return Math.round(result);
            return parseFloat(result.toFixed(2));
        });
        
        return `<li>${scaledLine}</li>`;
    }).join('');
}

// --- NEW HELPER: FORMAT INSTRUCTIONS AS NUMBERED LIST ---
function formatInstructionsHTML(text) {
    if (!text) return '';
    const steps = text.split('\n').filter(line => line.trim() !== '');
    if (steps.length === 0) return '';
    return `<ol style="margin-left: 20px; padding-left: 0;">${steps.map(step => `<li style="margin-bottom: 5px;">${step}</li>`).join('')}</ol>`;
}

/* --- NEW IMPORT FROM URL LOGIC --- */
window.importRecipe = async () => {
    const urlInput = document.getElementById('import-url');
    const url = urlInput.value.trim();
    if(!url) return showToast("Please enter a valid URL");

    const btn = document.querySelector('.btn-import');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching...`;
    
    try {
        // Use AllOrigins proxy with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (!data.contents) throw new Error("No data returned");

        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        
        // Find JSON-LD script
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        let foundRecipe = null;

        for (const script of scripts) {
            try {
                const json = JSON.parse(script.innerText);
                const items = Array.isArray(json['@graph']) ? json['@graph'] : (Array.isArray(json) ? json : [json]);
                
                foundRecipe = items.find(item => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
                if(foundRecipe) break;
            } catch(e) { console.error(e); }
        }

        if(foundRecipe) {
            document.getElementById('inp-title').value = foundRecipe.name || '';
            
            if(foundRecipe.recipeIngredient) {
                const ings = Array.isArray(foundRecipe.recipeIngredient) ? foundRecipe.recipeIngredient.join('\n') : foundRecipe.recipeIngredient;
                document.getElementById('inp-ingredients').value = ings;
            }

            if(foundRecipe.recipeInstructions) {
                let instText = '';
                if(Array.isArray(foundRecipe.recipeInstructions)) {
                    instText = foundRecipe.recipeInstructions.map(step => {
                        if(typeof step === 'object') return step.text || step.name || '';
                        return step;
                    }).join('\n');
                } else {
                    instText = foundRecipe.recipeInstructions;
                }
                document.getElementById('inp-instructions').value = instText;
            }
            
            showToast("Recipe imported successfully!");
            urlInput.value = ''; 
        } else {
            openAlertModal("Unable to extract recipe details. Please add manually");
        }

    } catch(e) {
        console.error(e);
        openAlertModal("Unable to access this link. Please add details manually.");
    } finally {
        btn.innerHTML = originalText;
    }
};

// --- PRINT RECIPE FUNCTION ---
window.printRecipe = () => {
    const title = document.getElementById('view-modal-title').innerText;
    const ingredients = document.getElementById('view-ingredients').innerText;
    
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>' + title + '</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('body { font-family: sans-serif; padding: 2rem; color: #333; line-height: 1.6; }');
    printWindow.document.write('h1 { font-family: serif; border-bottom: 2px solid #5C8D89; padding-bottom: 10px; margin-bottom: 20px; }');
    printWindow.document.write('h2 { font-size: 1.2rem; text-transform: uppercase; color: #5C8D89; margin-top: 30px; letter-spacing: 1px; }');
    printWindow.document.write('ul { list-style: none; padding: 0; }');
    printWindow.document.write('li { margin-bottom: 8px; display: flex; align-items: flex-start; gap: 10px; }');
    printWindow.document.write('.checkbox { width: 16px; height: 16px; border: 1px solid #ccc; display: inline-block; flex-shrink: 0; margin-top: 4px; }');
    printWindow.document.write('</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<h1>' + title + '</h1>');
    
    printWindow.document.write('<h2>Ingredients</h2>');
    printWindow.document.write('<ul>');
    const ingLines = ingredients.split('\n').filter(l => l.trim());
    ingLines.forEach(line => {
        printWindow.document.write('<li><span class="checkbox"></span> ' + line + '</li>');
    });
    printWindow.document.write('</ul>');

    printWindow.document.write('<h2>Instructions</h2>');
    const instHTML = document.getElementById('view-instructions').innerHTML;
    printWindow.document.write('<div>' + instHTML + '</div>');

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
};

window.openAlertModal = (message) => {
    document.getElementById('alert-message').innerText = message;
    document.getElementById('alert-modal').classList.add('open');
};
window.closeAlertModal = () => document.getElementById('alert-modal').classList.remove('open');

window.openAddFriendModal = () => {
    document.getElementById('add-friend-modal').classList.add('open');
    document.getElementById('add-friend-msg').innerText = '';
    document.getElementById('friend-email-input').value = '';
};
window.closeAddFriendModal = () => document.getElementById('add-friend-modal').classList.remove('open');

window.addFriend = async () => {
    const email = document.getElementById('friend-email-input').value.trim().toLowerCase();
    const msg = document.getElementById('add-friend-msg');
    if(!email) return;
    if(email === currentUser.email) { msg.innerText = "You can't add yourself!"; return; }

    document.getElementById('loader').style.display = 'flex';
    const safeEmail = email.replace(/\./g, ',');
    
    try {
        const docSnap = await getDoc(doc(db, "public_profiles", safeEmail));
        if (docSnap.exists()) {
            const friendData = docSnap.data();
            if(friends.some(f => f.uid === friendData.uid)) {
                msg.innerText = "Already in your friends list.";
            } else {
                friends.push(friendData);
                await setDoc(doc(db, "users", currentUser.uid, "data", "friends"), { list: friends });
                renderFriendsList();
                closeAddFriendModal();
            }
        } else {
            msg.innerHTML = `<span style="color:var(--danger)">User not found.</span><br>Ask them to update their profile to be discoverable.`;
        }
    } catch (error) {
        console.error(error);
        msg.innerText = "Error searching. Check your connection.";
    }
    document.getElementById('loader').style.display = 'none';
};

function renderFriendsList() {
    const container = document.getElementById('friends-list-container');
    container.innerHTML = '';
    if(friends.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-light)">No friends added yet.</div>';
        return;
    }
    friends.forEach(f => {
        const initial = f.firstName ? f.firstName.charAt(0).toUpperCase() : '?';
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div style="display:flex; align-items:center;">
                <div class="friend-avatar">${initial}</div>
                <div class="friend-info">
                    <div class="friend-name">${f.firstName} ${f.lastName}</div>
                    <div class="friend-email">${f.email}</div>
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text-light)"></i>
        `;
        item.onclick = () => loadFriendCookbook(f);
        container.appendChild(item);
    });
}

async function loadFriendCookbook(friend) {
    document.getElementById('loader').style.display = 'flex';
    const grid = document.getElementById('friend-recipe-grid');
    grid.innerHTML = '';
    document.getElementById('friend-cookbook-title').innerText = `${friend.firstName}'s Cookbook`;
    friendRecipes = []; 

    try {
        const q = query(collection(db, "users", friend.uid, "recipes"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-light)">No recipes found.</div>';
        } else {
            const fragment = document.createDocumentFragment();
            querySnapshot.forEach((doc) => {
                const r = doc.data();
                r.id = doc.id; 
                friendRecipes.push(r);

                const cats = Array.isArray(r.category) ? r.category : [r.category || 'Other'];
                
                const card = document.createElement('div');
                card.className = 'recipe-card';
                
                let badgesHtml = '<div class="cat-badges">';
                cats.forEach(c => {
                    const badgeColor = getColorForCategory(c);
                    badgesHtml += `<div class="cat-badge" style="background-color: ${badgeColor}; color: white; border:1px solid rgba(0,0,0,0.1); text-shadow:0 1px 2px rgba(0,0,0,0.2);">${c}</div>`;
                });
                badgesHtml += '</div>';

                const formattedInst = formatInstructionsHTML(r.instructions);

                card.innerHTML = `
                    <div class="card-header">
                        <div style="flex-grow:1;">
                            ${badgesHtml}
                            <div class="recipe-title">${r.title}</div>
                        </div>
                    </div>
                    <div class="clickable-area" onclick="openViewModal('${r.id}', true)">
                        <div class="recipe-details"><h4>Ingredients</h4><ul class="ingredient-list">${r.ingredients.split('\n').map(i=>`<li>${i}</li>`).join('')}</ul></div>
                        <div class="recipe-details" style="flex-grow: 1;"><h4>Instructions</h4><div class="instruction-preview">${formattedInst}</div></div>
                    </div>
                    <div class="card-actions">
                            <button class="primary" style="width:100%; font-size:0.9rem;" onclick='copyFriendRecipe(${JSON.stringify(r).replace(/'/g, "&#39;")})'><i class="fas fa-download"></i> Save to My Books</button>
                    </div>
                `;
                fragment.appendChild(card);
            });
            grid.appendChild(fragment);
        }
        switchTab('friend-cookbook');
    } catch (error) {
        console.error(error);
        alert("Could not load recipes. Make sure your friend has updated their privacy settings (Security Rules).");
    }
    document.getElementById('loader').style.display = 'none';
}

window.copyFriendRecipe = async (rData) => {
    const data = {
        title: rData.title,
        category: rData.category,
        ingredients: rData.ingredients,
        instructions: rData.instructions,
        favorite: false
    };
    document.getElementById('loader').style.display = 'flex';
    const docRef = await addDoc(collection(db, "users", currentUser.uid, "recipes"), data);
    
    const newRecipe = { ...data, id: docRef.id };
    recipes.push(newRecipe);
    
    if(currentDashboardFilter === 'All' || (Array.isArray(newRecipe.category) ? newRecipe.category.includes(currentDashboardFilter) : newRecipe.category === currentDashboardFilter)) {
            renderRecipes();
    }

    document.getElementById('loader').style.display = 'none';
    showToast("Recipe saved to your dashboard!");
};

function initCustomSelects() {
    setupCustomSelect('inv-cat-select');
    setupCustomSelect('groc-cat-select');
}

function setupCustomSelect(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    
    const select = container.querySelector('select');
    const existingSelected = container.querySelector('.select-selected');
    const existingItems = container.querySelector('.select-items');
    if(existingSelected) existingSelected.remove();
    if(existingItems) existingItems.remove();

    const selectedDiv = document.createElement("div");
    selectedDiv.setAttribute("class", "select-selected");
    selectedDiv.innerHTML = select.options[select.selectedIndex].innerHTML;
    container.appendChild(selectedDiv);

    const optionsDiv = document.createElement("div");
    optionsDiv.setAttribute("class", "select-items select-hide");

    for (let i = 0; i < select.length; i++) {
        const optionDiv = document.createElement("div");
        optionDiv.innerHTML = select.options[i].innerHTML;
        optionDiv.addEventListener("click", function(e) {
            select.selectedIndex = i;
            selectedDiv.innerHTML = this.innerHTML;
            
            const sameAsSelected = this.parentNode.querySelectorAll(".same-as-selected");
            sameAsSelected.forEach(el => el.classList.remove("same-as-selected"));
            this.setAttribute("class", "same-as-selected");
            
            selectedDiv.click(); 
            select.dispatchEvent(new Event('change'));
        });
        optionsDiv.appendChild(optionDiv);
    }
    container.appendChild(optionsDiv);

    selectedDiv.addEventListener("click", function(e) {
        e.stopPropagation();
        closeAllSelect(this);
        this.nextSibling.classList.toggle("select-hide");
        this.classList.toggle("select-arrow-active");
    });
}

function closeAllSelect(elmnt) {
    const items = document.getElementsByClassName("select-items");
    const selected = document.getElementsByClassName("select-selected");
    const arrNo = [];
    for (let i = 0; i < selected.length; i++) {
        if (elmnt == selected[i]) {
            arrNo.push(i)
        } else {
            selected[i].classList.remove("select-arrow-active");
        }
    }
    for (let i = 0; i < items.length; i++) {
        if (arrNo.indexOf(i)) {
            items[i].classList.add("select-hide");
        }
    }
}
document.addEventListener("click", closeAllSelect);

window.toggleAuthMode = () => {
    isSignup = !isSignup;
    const title = document.getElementById('auth-title');
    const btn = document.querySelector('#auth-modal button');
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

window.handleAuth = async () => {
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
        errorEl.innerText = error.message;
        errorEl.style.display = 'block';
    }
};

window.handleLogout = () => signOut(auth);
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
    await setDoc(doc(db, "users", currentUser.uid, "data", "settings"), { categories: appCategories });
    await saveProfile(); 

    await addDoc(collection(db, "users", currentUser.uid, "recipes"), {
        title: 'Avocado Toast', category: ['Breakfast'], ingredients: 'Bread\nAvocado', instructions: 'Toast bread.', favorite: true, id: Date.now()
    });
}

async function loadUserData() {
    document.getElementById('loader').style.display = 'flex';
    
    recipes = [];
    const q = query(collection(db, "users", currentUser.uid, "recipes"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => { 
        let data = doc.data();
        if (data.category && typeof data.category === 'string') {
            data.category = [data.category]; 
        }
        recipes.push({ ...data, id: doc.id }); 
    });

    const invSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "inventory"));
    inventory = invSnap.exists() ? invSnap.data().items : [];

    const mpSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "mealPlan"));
    mealPlan = mpSnap.exists() ? mpSnap.data().plan : {};

    const grocSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "grocery"));
    manualGrocery = grocSnap.exists() ? grocSnap.data().items : [];

    const friendsSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "friends"));
    friends = friendsSnap.exists() ? friendsSnap.data().list : [];

    const setSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "settings"));
    if(setSnap.exists() && setSnap.data().categories) {
        let rawCats = setSnap.data().categories;
        if (rawCats.length > 0 && typeof rawCats[0] === 'string') {
            appCategories = rawCats.map(name => {
                let match = appCategories.find(def => def.name === name);
                return { name: name, color: match ? match.color : stringToColor(name) };
            });
        } else {
            appCategories = rawCats.map(catObj => {
                  let defaultMatch = appCategories.find(def => def.name === catObj.name);
                  if(defaultMatch && defaultMatch.color !== catObj.color) {
                     return { name: catObj.name, color: defaultMatch.color }; 
                  }
                  return catObj;
            });
        }
    } else {
        await setDoc(doc(db, "users", currentUser.uid, "data", "settings"), { categories: appCategories });
    }

    const profSnap = await getDoc(doc(db, "users", currentUser.uid, "data", "profile"));
    if(profSnap.exists()) userProfile = profSnap.data();
    else userProfile = { firstName: '', lastName: '' };

    renderGreeting();
    renderDashboardFilters();
    renderRecipes();
    renderMealPlan();
    renderInventory();
    renderFriendsList();
    generateGroceryList();
    document.getElementById('loader').style.display = 'none';
}

async function saveSettingsToCloud() {
    await setDoc(doc(db, "users", currentUser.uid, "data", "settings"), { categories: appCategories });
}
async function saveInventoryToCloud() { await setDoc(doc(db, "users", currentUser.uid, "data", "inventory"), { items: inventory }); }
async function saveMealPlanToCloud() { await setDoc(doc(db, "users", currentUser.uid, "data", "mealPlan"), { plan: mealPlan }); }
async function saveGroceryToCloud() { await setDoc(doc(db, "users", currentUser.uid, "data", "grocery"), { items: manualGrocery }); }

window.saveAllData = async () => {
    const btn = document.getElementById('btn-global-save');
    const icon = btn.querySelector('i');
    icon.className = 'fas fa-spinner fa-spin';
    
    try {
        await Promise.all([
            saveSettingsToCloud(),
            saveInventoryToCloud(),
            saveMealPlanToCloud(),
            saveGroceryToCloud()
        ]);
        showToast("All changes saved to cloud!");
    } catch (e) {
        console.error(e);
        showToast("Error saving data");
    } finally {
        icon.className = 'fas fa-check';
        setTimeout(() => { icon.className = 'fas fa-save'; }, 2000);
    }
};

window.openConfirmModal = (message, callback) => {
    document.getElementById('confirm-message').innerText = message;
    confirmCallback = callback;
    document.getElementById('confirm-modal').classList.add('open');
};
window.closeConfirmModal = () => { document.getElementById('confirm-modal').classList.remove('open'); confirmCallback = null; };
document.getElementById('confirm-yes-btn').onclick = () => { if (confirmCallback) confirmCallback(); window.closeConfirmModal(); };

window.switchTab = (tabId) => {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    document.querySelectorAll('.nav-tabs button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-item').forEach(btn => btn.classList.remove('active'));

    const friendBtn = document.getElementById('btn-friends-nav');
    if(friendBtn) friendBtn.classList.remove('active');

    if(window.innerWidth > 768) {
        if (tabId === 'friends' || tabId === 'friend-cookbook') {
            if(friendBtn) friendBtn.classList.add('active');
        } else {
            const tabs = ['dashboard', 'planning', 'substitutions'];
            const index = tabs.indexOf(tabId);
            if (index > -1) {
                document.querySelectorAll('.nav-tabs button')[index].classList.add('active');
            }
        }
    } else {
        const mobIndex = ['dashboard', 'planning', 'friends', 'substitutions'].indexOf(tabId);
        if(tabId === 'friend-cookbook') {
              document.querySelectorAll('.mobile-nav-item')[2].classList.add('active');
        } else if(mobIndex > -1) {
            document.querySelectorAll('.mobile-nav-item')[mobIndex].classList.add('active');
        }
    }
};

window.addEventListener('resize', () => {
    if(currentUser) {
        if(window.innerWidth > 768) {
            document.getElementById('nav-actions').style.display = 'flex';
            document.getElementById('mobile-nav').style.display = 'none';
        } else {
            document.getElementById('nav-actions').style.display = 'none';
            document.getElementById('mobile-nav').style.display = 'flex';
        }
    }
});

window.openCatManager = () => {
    renderCatManagerList();
    document.getElementById('cat-manager-modal').classList.add('open');
    selectedColor = PRESET_COLORS[0];
    initColorPicker();
};
window.closeCatManager = () => document.getElementById('cat-manager-modal').classList.remove('open');

function renderCatManagerList() {
    const list = document.getElementById('manage-cat-list');
    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    appCategories.forEach((catObj, index) => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.draggable = true;
        li.dataset.index = index;
        li.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span class="cat-grip"><i class="fas fa-grip-lines"></i></span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="cat-color-dot" style="background:${catObj.color}" onclick="openEditColor(event, ${index})"></span> 
                    <span class="cat-name">${catObj.name}</span>
                </div>
            </div>
            <i class="fas fa-trash-alt cat-delete" onclick="deleteCategory(${index})"></i>
        `;
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragenter', handleDragEnter);
        li.addEventListener('dragleave', handleDragLeave);
        fragment.appendChild(li);
    });
    list.appendChild(fragment);
}

/* --- NEW: Edit Color Popup Logic --- */
window.openEditColor = (e, index) => {
    e.stopPropagation();
    const popup = document.getElementById('edit-color-popup');
    popup.innerHTML = '';
    
    PRESET_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.onclick = async () => {
            appCategories[index].color = color;
            await saveSettingsToCloud();
            renderCatManagerList();
            renderDashboardFilters(); // Re-render filter pills to update color if used there
            renderRecipes(); // Re-render recipes to update badge colors
            renderMealPlan(); // Update planner colors
            popup.style.display = 'none';
        };
        popup.appendChild(swatch);
    });

    // Position popup near the clicked dot
    const rect = e.target.getBoundingClientRect();
    popup.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';
    popup.style.display = 'flex';
};

window.addNewCategory = async () => {
    const input = document.getElementById('new-cat-name');
    const val = input.value.trim();
    if(!val) return;
    const clean = val.charAt(0).toUpperCase() + val.slice(1);
    if(!appCategories.some(c => c.name === clean)) {
        appCategories.push({ name: clean, color: selectedColor });
        await saveSettingsToCloud();
        renderCatManagerList();
        renderDashboardFilters();
    }
    input.value = '';
};

window.deleteCategory = (index) => {
    window.openConfirmModal("Remove this category?", async () => {
        appCategories.splice(index, 1);
        await saveSettingsToCloud();
        renderCatManagerList();
        renderDashboardFilters();
    });
};

let dragSrcEl = null;
function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}
function handleDragOver(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }
function handleDragEnter(e) { this.classList.add('over'); }
function handleDragLeave(e) { this.classList.remove('over'); }
function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl !== this) {
        const oldIdx = parseInt(dragSrcEl.dataset.index);
        const newIdx = parseInt(this.dataset.index);
        const item = appCategories.splice(oldIdx, 1)[0];
        appCategories.splice(newIdx, 0, item);
        saveSettingsToCloud();
        renderCatManagerList();
        renderDashboardFilters();
    }
    return false;
}

window.saveRecipe = async () => {
    const id = document.getElementById('inp-id').value;
    const selectedTags = Array.from(document.querySelectorAll('#category-tag-container .tag-pill.selected')).map(el => el.dataset.name);
    const categories = selectedTags.length > 0 ? selectedTags : ['Other'];

    const data = {
        title: document.getElementById('inp-title').value,
        category: categories, 
        ingredients: document.getElementById('inp-ingredients').value,
        instructions: document.getElementById('inp-instructions').value,
    };
    if(!data.title) return alert("Title required");
    document.getElementById('loader').style.display = 'flex';
    if(id) {
        const recipeRef = doc(db, "users", currentUser.uid, "recipes", id);
        await updateDoc(recipeRef, data);
        const idx = recipes.findIndex(r => r.id === id);
        if(idx > -1) recipes[idx] = { ...recipes[idx], ...data };
    } else {
        data.favorite = false;
        const docRef = await addDoc(collection(db, "users", currentUser.uid, "recipes"), data);
        recipes.push({ ...data, id: docRef.id });
    }
    document.getElementById('loader').style.display = 'none';
    window.closeModal();
    renderRecipes();
    renderMealPlan(); 
    generateGroceryList();
};

window.deleteRecipe = (id) => {
    window.openConfirmModal("Permanently delete this recipe?", async () => {
        document.getElementById('loader').style.display = 'flex';
        await deleteDoc(doc(db, "users", currentUser.uid, "recipes", id));
        recipes = recipes.filter(r => r.id !== id);
        let planChanged = false;
        Object.keys(mealPlan).forEach(key => {
            if(mealPlan[key].recipeId === id) { delete mealPlan[key]; planChanged = true; }
        });
        if(planChanged) await saveMealPlanToCloud();
        document.getElementById('loader').style.display = 'none';
        renderRecipes();
        renderMealPlan();
        generateGroceryList();
    });
};

window.toggleFav = async (id) => {
    const r = recipes.find(x => x.id === id);
    if(r) {
        r.favorite = !r.favorite;
        renderRecipes(); 
        const recipeRef = doc(db, "users", currentUser.uid, "recipes", id);
        await updateDoc(recipeRef, { favorite: r.favorite });
    }
};

window.openModal = (editId = null) => {
    document.getElementById('recipe-modal').classList.add('open');
    const container = document.getElementById('category-tag-container');
    container.innerHTML = '';

    appCategories.forEach(catObj => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.dataset.name = catObj.name; 
        pill.innerHTML = `<span class="tag-color-dot" style="background:${catObj.color}"></span> ${catObj.name}`;
        pill.onclick = () => pill.classList.toggle('selected');
        container.appendChild(pill);
    });

    if (editId) {
        const r = recipes.find(x => x.id === editId);
        document.getElementById('modal-title').innerText = "Edit Recipe";
        document.getElementById('inp-id').value = r.id;
        document.getElementById('inp-title').value = r.title;
        
        const activeCats = Array.isArray(r.category) ? r.category : [r.category];
        Array.from(container.children).forEach(pill => {
            if (activeCats.includes(pill.dataset.name)) pill.classList.add('selected');
        });

        document.getElementById('inp-ingredients').value = r.ingredients;
        document.getElementById('inp-instructions').value = r.instructions;
    } else {
        document.getElementById('modal-title').innerText = "New Recipe";
        document.getElementById('inp-id').value = '';
        document.getElementById('inp-title').value = '';
        document.getElementById('inp-ingredients').value = '';
        document.getElementById('inp-instructions').value = '';
    }
};

window.closeModal = () => document.getElementById('recipe-modal').classList.remove('open');
window.editRecipe = (id) => window.openModal(id);

function renderDashboardFilters() {
    const container = document.getElementById('dashboard-filters');
    container.innerHTML = '';
    const displayCats = ["All", ...appCategories.map(c => c.name)];
    
    displayCats.forEach(catName => {
        const btn = document.createElement('button');
        btn.className = `filter-pill ${currentDashboardFilter === catName ? 'active' : ''}`;
        btn.innerText = catName;
        btn.onclick = () => { currentDashboardFilter = catName; renderDashboardFilters(); renderRecipes(); };
        container.appendChild(btn);
    });
}

function getColorForCategory(catName) {
    const found = appCategories.find(c => c.name === catName);
    return found ? found.color : stringToColor(catName);
}

window.openViewModal = (id) => {
    const r = recipes.find(x => x.id === id);
    if(!r) return;

    document.getElementById('view-modal-title').innerText = r.title;
    
    const badgesContainer = document.getElementById('view-modal-badges');
    const cats = Array.isArray(r.category) ? r.category : [r.category || 'Other'];
    let badgesHtml = '';
    cats.forEach(c => {
        const badgeColor = getColorForCategory(c);
        badgesHtml += `<div class="cat-badge" style="background-color: ${badgeColor}; color: white; border:1px solid rgba(0,0,0,0.1); text-shadow:0 1px 2px rgba(0,0,0,0.2);">${c}</div>`;
    });
    badgesContainer.innerHTML = badgesHtml;
    
    const ingList = document.getElementById('view-ingredients');
    const multiplier = r.currentMultiplier || 1.0;
    ingList.innerHTML = formatScaledIngredients(r.ingredients, multiplier);

    document.getElementById('view-instructions').innerHTML = formatInstructionsHTML(r.instructions);

    document.getElementById('view-btn-cook').onclick = () => { closeViewModal(); openCookMode(r.id); };
    document.getElementById('view-btn-edit').onclick = () => { closeViewModal(); editRecipe(r.id); };
    document.getElementById('view-btn-copy').onclick = () => {
        const text = `${r.title}\n\nINGREDIENTS:\n${r.ingredients}\n\nINSTRUCTIONS:\n${r.instructions}`;
        navigator.clipboard.writeText(text);
        showToast("Recipe copied to clipboard");
    };

    document.getElementById('view-recipe-modal').classList.add('open');
};

window.closeViewModal = () => document.getElementById('view-recipe-modal').classList.remove('open');

/* --- SEARCH LOGIC --- */
window.handleSearch = (val) => {
    const clearBtn = document.getElementById('clear-search-btn');
    // Immediate UI feedback for the X button
    if(val.trim().length > 0) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }

    // Debounce the heavy rendering
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearchQuery = val.trim();
        renderRecipes();
    }, 300); // 300ms delay
};

window.clearSearch = () => {
    document.getElementById('recipe-search').value = '';
    handleSearch('');
};

function renderRecipes() {
    const grid = document.getElementById('recipe-grid');
    const countEl = document.getElementById('total-recipe-count');
    grid.innerHTML = '';
    
    recipes.sort((a, b) => {
        if (a.favorite === b.favorite) {
            return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        }
        return a.favorite ? -1 : 1;
    });
    
    const filtered = recipes.filter(r => {
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        const catMatch = currentDashboardFilter === "All" || cats.includes(currentDashboardFilter);
        
        // Add Search Logic
        const titleMatch = r.title.toLowerCase().includes(currentSearchQuery.toLowerCase());

        return catMatch && titleMatch;
    });
    
    countEl.innerText = `${filtered.length} Recipe${filtered.length !== 1 ? 's' : ''}`;

    if (recipes.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 2rem; color:var(--text-light);">
            <div style="font-size: 1.2rem; font-weight: 500;">Add a recipe to get started!</div>
            </div>`;
            return;
    }

    if(filtered.length === 0) {
        if(currentSearchQuery.length > 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-light);">No recipes found matching "${currentSearchQuery}".</p>`;
        } else {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-light);">No recipes found for "${currentDashboardFilter}".</p>`;
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(r => {
        const cats = Array.isArray(r.category) ? r.category : [r.category || 'Other'];
        const card = document.createElement('div');
        card.className = 'recipe-card draggable';
        card.draggable = true;
        card.ondragstart = (e) => drag(e, r.id);
        
        let badgesHtml = '<div class="cat-badges">';
        cats.forEach(c => {
            const badgeColor = getColorForCategory(c);
            badgesHtml += `<div class="cat-badge" style="background-color: ${badgeColor}; color: white; border:1px solid rgba(0,0,0,0.1); text-shadow:0 1px 2px rgba(0,0,0,0.2);">${c}</div>`;
        });
        badgesHtml += '</div>';

        const multiplier = r.currentMultiplier || 1.0;
        const scaledIngredients = formatScaledIngredients(r.ingredients, multiplier);
        const formattedInst = formatInstructionsHTML(r.instructions);

        card.innerHTML = `
            <div class="card-header">
                <div style="flex-grow:1;">
                    ${badgesHtml}
                    <div class="recipe-title">${r.title}</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                    <button class="fav-btn ${r.favorite ? 'active' : ''}" onclick="toggleFav('${r.id}')"><i class="${r.favorite ? 'fas' : 'far'} fa-star"></i></button>
                    <div class="multiplier-badge">
                        <button class="mult-btn" onclick="updateMultiplier(this, -0.5)">-</button>
                        <span class="mult-val">${multiplier}x</span>
                        <button class="mult-btn" onclick="updateMultiplier(this, 0.5)">+</button>
                    </div>
                </div>
            </div>
            
            <div class="clickable-area" onclick="openViewModal('${r.id}')">
                <div class="recipe-details">
                    <h4>Ingredients</h4>
                    <ul class="ingredient-list" data-original="${encodeURIComponent(r.ingredients)}">${scaledIngredients}</ul>
                </div>
                <div class="recipe-details"><h4>Instructions</h4><div class="instruction-preview">${formattedInst}</div></div>
            </div>

            <div class="card-actions">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="btn-cook" onclick="openCookMode('${r.id}')"><i class="fas fa-fire"></i> Cook</button>
                    </div>
                    <div class="action-buttons">
                    <button class="btn-icon" onclick="editRecipe('${r.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="deleteRecipe('${r.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

window.drag = (ev, id) => { ev.dataTransfer.setData("recipeId", id); };
window.allowDrop = (ev) => { ev.preventDefault(); ev.target.closest('.meal-slot').classList.add('drag-over'); };
window.drop = (ev) => {
    ev.preventDefault();
    const slot = ev.target.closest('.meal-slot');
    slot.classList.remove('drag-over');
    const id = ev.dataTransfer.getData("recipeId");
    if(!id) return;
    updateMealSlot(slot.dataset.day, slot.dataset.type, id);
};

window.openMealSelector = (day, type) => {
    activeSlot = { day, type };
    currentPickerFilter = "All";
    renderPickerFilters();
    renderPickerList();
    document.getElementById('selector-modal').classList.add('open');
};
window.closeSelectorModal = () => document.getElementById('selector-modal').classList.remove('open');

function renderPickerFilters() {
    const container = document.getElementById('picker-filters');
    container.innerHTML = '';
    const displayCats = ["All", ...appCategories.map(c => c.name)];
    displayCats.forEach(catName => {
        const btn = document.createElement('button');
        btn.className = `filter-pill ${currentPickerFilter === catName ? 'active' : ''}`;
        btn.innerText = catName;
        btn.onclick = () => { currentPickerFilter = catName; renderPickerFilters(); renderPickerList(); };
        container.appendChild(btn);
    });
}

function renderPickerList() {
    const list = document.getElementById('picker-list');
    list.innerHTML = '';
    if(recipes.length === 0) { list.innerHTML = '<li style="padding:1rem; color:#777;">Add recipes to dashboard first.</li>'; return; }
    
    const filtered = currentPickerFilter === "All" 
        ? recipes 
        : recipes.filter(r => {
            const cats = Array.isArray(r.category) ? r.category : [r.category];
            return cats.includes(currentPickerFilter);
        });

    if(filtered.length === 0) { list.innerHTML = '<li style="padding:1rem; color:#777;">No matching recipes found.</li>'; return; }
    
    const fragment = document.createDocumentFragment();
    filtered.forEach(r => {
        const li = document.createElement('li');
        li.className = 'picker-item';
        li.innerHTML = `<span><strong>${r.title}</strong></span><i class="fas fa-plus"></i>`;
        li.onclick = () => { updateMealSlot(activeSlot.day, activeSlot.type, r.id); window.closeSelectorModal(); };
        fragment.appendChild(li);
    });
    list.appendChild(fragment);
}

async function updateMealSlot(day, type, recipeId) {
    const key = `${day}-${type}`;
    mealPlan[key] = { recipeId, day, type };
    renderMealPlan();
    generateGroceryList();
    await saveMealPlanToCloud();
}

window.removeFromPlan = async (e, key) => { e.stopPropagation(); delete mealPlan[key]; renderMealPlan(); generateGroceryList(); await saveMealPlanToCloud(); };
window.clearWeeklyPlan = () => {
    window.openConfirmModal("Clear the entire week's plan?", async () => {
        document.getElementById('loader').style.display = 'flex';
        mealPlan = {};
        await saveMealPlanToCloud();
        renderMealPlan();
        generateGroceryList();
        document.getElementById('loader').style.display = 'none';
    });
};

function renderMealPlan() {
    document.querySelectorAll('.meal-slot').forEach(slot => {
        slot.innerHTML = '<span class="slot-placeholder"><i class="fas fa-plus"></i></span>';
        slot.onclick = () => window.openMealSelector(slot.dataset.day, slot.dataset.type);
    });
    Object.keys(mealPlan).forEach(key => {
        const plan = mealPlan[key];
        const recipe = recipes.find(r => r.id === plan.recipeId);
        const slot = document.querySelector(`.meal-slot[data-day="${plan.day}"][data-type="${plan.type}"]`);
        if (recipe && slot) {
            slot.onclick = null; 
            const firstCatName = Array.isArray(recipe.category) ? recipe.category[0] : recipe.category;
            const color = getColorForCategory(firstCatName || 'Other');
            slot.innerHTML = `
                <div class="planned-meal" style="border-left-color: ${color}">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${recipe.title}</span>
                    <i class="fas fa-times remove-meal" onclick="removeFromPlan(event, '${key}')"></i>
                </div>
            `;
        }
    });
}

function renderInventory() {
    const container = document.getElementById('inventory-list-container');
    container.innerHTML = '';
    INVENTORY_CATEGORIES.forEach(cat => {
        const catItems = inventory.filter(i => i.category === cat).sort((a,b)=>a.name.localeCompare(b.name));
        if(catItems.length > 0) {
            container.innerHTML += `<div class="inv-category-header">${cat}</div>`;
            catItems.forEach(item => {
                const idx = inventory.indexOf(item);
                container.innerHTML += `
                    <div class="inventory-item-row">
                        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleInventory(${idx})">
                        <label>${item.name}</label>
                        <i class="fas fa-times delete-item" onclick="deleteInventoryItem(${idx})"></i>
                    </div>
                `;
            });
        }
    });
}

window.toggleInventory = async (idx) => { inventory[idx].checked = !inventory[idx].checked; renderInventory(); generateGroceryList(); await saveInventoryToCloud(); };
window.deleteInventoryItem = async (idx) => { inventory.splice(idx, 1); renderInventory(); generateGroceryList(); await saveInventoryToCloud(); };
window.addInventoryItem = async () => {
    const name = document.getElementById('new-inventory-item').value.trim();
    const cat = document.getElementById('new-item-category').value;
    if(!name) return;
    const clean = name.charAt(0).toUpperCase() + name.slice(1);
    if(inventory.find(i=>i.name.toLowerCase()===clean.toLowerCase())) return alert("Item exists");
    inventory.push({ name: clean, category: cat, checked: true });
    document.getElementById('new-inventory-item').value = '';
    renderInventory(); generateGroceryList(); await saveInventoryToCloud();
};

function detectCategory(name) {
    name = name.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) { if (keywords.some(k => name.includes(k))) return cat; }
    return "Other";
}

window.addManualGroceryItem = async () => {
    const name = document.getElementById('manual-grocery-item').value.trim();
    const cat = document.getElementById('manual-grocery-category').value;
    if(!name) return;
    const clean = name.charAt(0).toUpperCase() + name.slice(1);
    manualGrocery.push({ name: clean, category: cat, isManual: true });
    document.getElementById('manual-grocery-item').value = '';
    generateGroceryList(); await saveGroceryToCloud();
};

window.removeManualItem = async (idx) => { manualGrocery.splice(idx, 1); generateGroceryList(); await saveGroceryToCloud(); };

function parseIngredient(text) {
    text = text.toLowerCase().trim();
    text = text.replace(/^[\d\s\/\.\u00BC-\u00BE\u2150-\u215E\-]+/, '').trim();
    const units = [ "cups", "cup", "c", "tablespoons", "tablespoon", "tbsp", "tbs", "t", "teaspoons", "teaspoon", "tsp", "ounces", "ounce", "oz", "pounds", "pound", "lbs", "lb", "grams", "gram", "g", "kilograms", "kilogram", "kg", "milliliters", "milliliter", "ml", "liters", "liter", "l", "pints", "pint", "pt", "quarts", "quart", "qt", "gallons", "gallon", "gal", "dash", "pinch", "handful", "splash", "slices", "slice", "cans", "can", "jars", "jar", "packages", "package", "pkg", "sticks", "stick", "cloves", "clove", "bunches", "bunch", "heads", "head", "stalks", "stalk" ];
    const unitPattern = units.sort((a,b) => b.length - a.length).join('|');
    const regex = new RegExp(`^(${unitPattern})\\b\\s*(of\\s+)?`, 'i');
    text = text.replace(regex, '').trim();
    return text;
}

function generateGroceryList() {
    let needed = [];
    Object.values(mealPlan).forEach(p => {
        const r = recipes.find(x => x.id === p.recipeId);
        if(r) r.ingredients.split('\n').forEach(i => {
            let clean = parseIngredient(i);
            if(clean) needed.push(clean);
        });
    });

    const fridge = inventory.filter(i=>i.checked).map(i=>i.name.toLowerCase());
    const finalNeeded = needed.filter(n => !fridge.includes(n));
    const uniqueNeeded = [...new Set(finalNeeded)].map(n => ({
        name: n.charAt(0).toUpperCase() + n.slice(1),
        category: detectCategory(n),
        isManual: false
    }));

    const all = [...uniqueNeeded, ...manualGrocery];
    const listEl = document.getElementById('grocery-list-output');
    listEl.innerHTML = '';

    if(all.length === 0) { listEl.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-light)">All stocked up!</div>'; return; }

    INVENTORY_CATEGORIES.forEach(cat => {
        const items = all.filter(i => i.category === cat).sort((a,b)=>a.name.localeCompare(b.name));
        if(items.length > 0) {
            listEl.innerHTML += `<div class="inv-category-header">${cat}</div>`;
            items.forEach(item => {
                let del = '';
                if(item.isManual) {
                    const idx = manualGrocery.indexOf(item);
                    del = `<i class="fas fa-times delete-manual" onclick="removeManualItem(${idx})"></i>`;
                }
                listEl.innerHTML += `
                    <div class="grocery-item ${item.isManual?'manual-item':''}">
                        <input type="checkbox"> <label>${item.name}</label> ${del}
                    </div>
                `;
            });
        }
    });
}

window.copyGroceryList = () => {
    const listContainer = document.getElementById('grocery-list-output');
    const items = listContainer.querySelectorAll('.inv-category-header, .grocery-item label');
    let copyText = "GROCERY LIST:\n";
    items.forEach(el => {
        if(el.classList.contains('inv-category-header')) {
            copyText += `\n[${el.innerText}]\n`;
        } else {
            copyText += `- ${el.innerText}\n`;
        }
    });
    navigator.clipboard.writeText(copyText).then(() => {
        const btn = document.getElementById('btn-copy-list');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    });
};

window.openCookMode = (id) => {
    const r = recipes.find(x => x.id == id);
    if (!r) return;
    const currentMult = r.currentMultiplier || 1.0;
    
    document.getElementById('cook-title').innerText = r.title;
    const ingContainer = document.getElementById('cook-ingredients');
    
    const scaledHtml = formatScaledIngredients(r.ingredients, currentMult);
    
    ingContainer.innerHTML = '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = scaledHtml;
    const items = tempDiv.querySelectorAll('li');
    
    items.forEach(li => {
       ingContainer.innerHTML += `<div class="cook-list-item" onclick="this.classList.toggle('done'); this.querySelector('input').checked = !this.querySelector('input').checked"><input type="checkbox"><span>${li.innerText}</span></div>`;
    });

    const instContainer = document.getElementById('cook-instructions');
    instContainer.innerHTML = '';
    r.instructions.split('\n').filter(i=>i.trim()).forEach(inst => {
        instContainer.innerHTML += `<div class="cook-list-item" onclick="this.classList.toggle('done'); this.querySelector('input').checked = !this.querySelector('input').checked"><input type="checkbox"><span>${inst}</span></div>`;
    });
    document.getElementById('cook-mode-overlay').classList.add('active');
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => wakeLock = w); } catch(e){}
};
window.closeCookMode = () => {
    document.getElementById('cook-mode-overlay').classList.remove('active');
    if (wakeLock) wakeLock.release().then(()=>wakeLock=null);
};

</script>
</body>
</html>

// --- Event Listeners (The Fix) ---
// This connects the HTML button to the JavaScript function safely
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Wire up the Login/Signup Button
    const authBtn = document.getElementById('auth-btn');
    if(authBtn) {
        authBtn.addEventListener('click', () => {
            window.handleAuth();
        });
    }

    // 2. Allow pressing "Enter" key in the password box to log in
    const passInput = document.getElementById('auth-password');
    if(passInput) {
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                window.handleAuth();
            }
        });
    }
});
