let db; let allMemories = []; let currentCategory = 'All';
const request = indexedDB.open("VaultProDB", 12);

request.onupgradeneeded = (e) => {
    let dbUpdate = e.target.result;
    if (!dbUpdate.objectStoreNames.contains("memories")) {
        const store = dbUpdate.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
        store.createIndex("userEmail", "userEmail", { unique: false });
    }
};

request.onsuccess = (e) => { db = e.target.result; renderGallery(); updateStorageUI(); };

const getCurrentUser = () => JSON.parse(localStorage.getItem('currentUser'));

// Helper for navigation to ensure it works on GitHub Pages subfolders
function navigate(page) {
    window.location.href = page;
}

document.addEventListener("DOMContentLoaded", () => {
    const user = getCurrentUser();
    const path = window.location.pathname;
    
    // Redirect to gateway if not logged in and trying to access dashboard
    if (!user && path.includes('index.html')) {
        navigate('gateway.html');
    }
    
    if (user) {
        if(document.getElementById('welcomeMsg')) document.getElementById('welcomeMsg').innerText = `Welcome, ${user.name}`;
        if(document.getElementById('accountDisplay')) document.getElementById('accountDisplay').innerText = user.email;
    }
});

function logout() {
    localStorage.removeItem('currentUser');
    navigate('gateway.html');
}

// --- DATABASE & MEDIA LOGIC ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); reader.onerror = e => reject(e);
});

function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, {type:mime});
}

async function exportVault() {
    const user = getCurrentUser(); const tx = db.transaction("memories", "readonly");
    const store = tx.objectStore("memories"); const allRecords = [];
    store.openCursor().onsuccess = async (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const item = cursor.value; const processedItem = {...item};
            processedItem.images = await Promise.all(item.images.map(f => fileToBase64(f)));
            processedItem.videos = await Promise.all(item.videos.map(f => fileToBase64(f)));
            processedItem.audios = await Promise.all(item.audios.map(f => fileToBase64(f)));
            allRecords.push(processedItem); cursor.continue();
        } else {
            const blob = new Blob([JSON.stringify(allRecords)], {type: "application/json"});
            const url = URL.createObjectURL(blob); const link = document.createElement("a");
            link.href = url; link.download = `VaultBackup_${user.name}.json`; link.click();
        }
    };
}

async function importVault(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = JSON.parse(e.target.result); const tx = db.transaction("memories", "readwrite");
        const store = tx.objectStore("memories");
        for (let item of data) {
            item.images = item.images.map((s, i) => dataURLtoFile(s, `img_${i}`));
            item.videos = item.videos.map((s, i) => dataURLtoFile(s, `vid_${i}`));
            item.audios = item.audios.map((s, i) => dataURLtoFile(s, `aud_${i}`));
            delete item.id; store.add(item);
        }
        tx.oncomplete = () => location.reload();
    }; reader.readAsText(file);
}

async function saveEntry() {
    const user = getCurrentUser(); const title = document.getElementById('title').value;
    const desc = document.getElementById('desc').value; const category = document.getElementById('categorySelect').value;
    if (!title) return alert("Title required");
    const entry = {
        userEmail: user.email, title, desc, category,
        images: Array.from(document.getElementById('imageInput').files),
        videos: Array.from(document.getElementById('videoInput').files),
        audios: Array.from(document.getElementById('audioInput').files),
        timestamp: new Date().toLocaleString()
    };
    const tx = db.transaction("memories", "readwrite"); tx.objectStore("memories").add(entry);
    tx.oncomplete = () => location.reload();
}

function renderGallery() {
    const user = getCurrentUser(); if (!user || !db) return; allMemories = [];
    const index = db.transaction("memories", "readonly").objectStore("memories").index("userEmail");
    index.openCursor(IDBKeyRange.only(user.email)).onsuccess = (e) => {
        const cursor = e.target.result; if (cursor) { allMemories.push(cursor.value); cursor.continue(); } else { applyFilters(); }
    };
}

function applyFilters() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const filtered = allMemories.filter(item => {
        return (item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)) && (currentCategory === 'All' || item.category === currentCategory);
    });
    const gallery = document.getElementById('gallery'); if(!gallery) return; gallery.innerHTML = '';
    filtered.forEach(item => {
        const card = document.createElement('div'); card.className = 'card';
        const visuals = [...item.images.map(f=>({f,t:'img'})), ...item.videos.map(f=>({f,t:'vid'}))];
        let h = `<div class="media-grid">`;
        visuals.slice(0,2).forEach((m,i)=>{
            const isMore = i===1 && visuals.length>2;
            h += `<div class="media-box" onclick="openFull(${item.id})">${m.t==='img'?`<img src="${URL.createObjectURL(m.f)}">`:`<video src="${URL.createObjectURL(m.f)}"></video>`}${isMore?`<div class="more-overlay">+${visuals.length-2}</div>`:''}</div>`;
        });
        if(visuals.length === 0) h += `<div style="grid-column: span 2; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:0.7rem;">NO MEDIA</div>`;
        h += `</div><div style="padding:20px;"><span class="category-badge">${item.category}</span><h3>${item.title}</h3><p>${item.desc}</p><button onclick="deleteEntry(${item.id})" class="delete-link">Delete</button></div>`;
        card.innerHTML = h; gallery.prepend(card);
    });
}

function openFull(id) {
    const item = allMemories.find(m => m.id === id); const inner = document.getElementById('modalInner');
    inner.innerHTML = `<h2 style="color:white; margin-bottom:20px;">${item.title}</h2>`;
    item.images.forEach(f => inner.innerHTML += `<img src="${URL.createObjectURL(f)}" class="modal-media-item">`);
    item.videos.forEach(f => inner.innerHTML += `<video src="${URL.createObjectURL(f)}" controls class="modal-media-item"></video>`);
    item.audios.forEach(f => inner.innerHTML += `<div class="audio-card"><audio src="${URL.createObjectURL(f)}" controls style="width:100%"></audio></div>`);
    document.getElementById('mediaModal').style.display='flex'; document.body.style.overflow='hidden';
}

function closeModal() { document.getElementById('mediaModal').style.display='none'; document.body.style.overflow='auto'; }
function setFilter(c, b) { currentCategory = c; document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); applyFilters(); }
function handleSearch() { applyFilters(); }
function deleteEntry(id) { if(confirm("Delete?")){ const tx=db.transaction("memories","readwrite"); tx.objectStore("memories").delete(id); tx.oncomplete=()=>location.reload(); } }

async function updateStorageUI() {
    if (navigator.storage && navigator.storage.estimate) {
        const {usage, quota} = await navigator.storage.estimate(); const percent = ((usage/quota)*100).toFixed(1);
        if(document.getElementById('storageText')) document.getElementById('storageText').innerText = `Used: ${(usage/1024/1024).toFixed(1)}MB / Total: ${(quota/1024/1024).toFixed(0)}MB (${percent}%)`;
        if(document.getElementById('storageBar')) document.getElementById('storageBar').style.width = percent + "%";
    }
}

function togglePass(i, b) { const e=document.getElementById(i); e.type=e.type==="password"?"text":"password"; b.innerText=e.type==="password"?"👁️":"🙈"; }