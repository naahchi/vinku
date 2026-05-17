// =======================
// ====== ELEMENTS =======
// =======================
const input = document.getElementById("search");
const dropdown = document.getElementById("dropdown");
const suggestions = document.getElementById("suggestions");
const loader = document.getElementById("loader");
const noResults = document.getElementById("noResults");

// =======================
// ====== STATE =========
// =======================
let cities = [];
let fuse = null;
let prefixMap = new Map();
let citySet = new Set();
let currentFocus = -1;

// =======================
// ====== HELPERS ========
// =======================

// slugify
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
}

// Title Case
function toTitleCase(text) {
  return text
    .replace(/-/g, " ")
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// format display
function formatText(slug) {
  return slug ? toTitleCase(slug) : "";
}

// normalize
function norm(s) {
  return (s || "").toLowerCase();
}

// debounce
function debounce(fn, delay = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

// validate city
function isValidCity(city, state) {
  return citySet.has(`${city}-${state}`);
}

// =======================
// ====== INDEX =========
// =======================

function buildIndex(data) {
  prefixMap.clear();

  data.forEach(item => {
    const name = norm(item.city);

    for (let i = 1; i <= name.length; i++) {
      const p = name.slice(0, i);
      if (!prefixMap.has(p)) prefixMap.set(p, []);
      prefixMap.get(p).push(item);
    }
  });
}

// fast validation set
function buildCitySet(data) {
  citySet.clear();

  data.forEach(item => {
    const key = `${slugify(item.city)}-${slugify(item.state)}`;
    citySet.add(key);
  });
}

// =======================
// ====== UI STATES ======
// =======================

function showLoader(count = 5) {
  suggestions.innerHTML = "";
  noResults.style.display = "none";
  loader.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const div = document.createElement("div");
    div.className = "loader-item";
    loader.appendChild(div);
  }
}

function hideLoader() {
  loader.innerHTML = "";
}

function showNoResults() {
  suggestions.innerHTML = "";
  hideLoader();
  noResults.style.display = "block";
}

// =======================
// ====== RENDER =========
// =======================

function highlight(text, query) {
  if (!query) return text;

  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text.replace(
    new RegExp(safe, "gi"),
    match => `<mark>${match}</mark>`
  );
}

function showSuggestions(list, query) {
  hideLoader();
  noResults.style.display = "none";
  suggestions.innerHTML = "";
  currentFocus = -1;

  list.forEach(item => {
    const li = document.createElement("li");

    li.innerHTML = `
      <span class="city">${highlight(item.city, query)}</span>
      <span class="state">${item.state}</span>
    `;

    li.onclick = () => {
      input.value = `${item.city}, ${item.state}`;
      closeDropdown();
    };

    suggestions.appendChild(li);
  });
}

// =======================
// ====== DROPDOWN =======
// =======================

function openDropdown() {
  dropdown.classList.remove("hidden");
}

function closeDropdown() {
  dropdown.classList.add("hidden");
  suggestions.innerHTML = "";
  hideLoader();
  noResults.style.display = "none";
  currentFocus = -1;
}

// =======================
// ====== KEYBOARD =======
// =======================

function addActive(items) {
  if (!items.length) return;

  removeActive(items);

  if (currentFocus >= items.length) currentFocus = 0;
  if (currentFocus < 0) currentFocus = items.length - 1;

  items[currentFocus].classList.add("active");
}

function removeActive(items) {
  [...items].forEach(i => i.classList.remove("active"));
}

input.addEventListener("keydown", (e) => {
  const items = suggestions.getElementsByTagName("li");

  if (e.key === "ArrowDown") {
    currentFocus++;
    addActive(items);
  } else if (e.key === "ArrowUp") {
    currentFocus--;
    addActive(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (currentFocus > -1 && items[currentFocus]) {
      items[currentFocus].click();
    }
  } else if (e.key === "Escape") {
    closeDropdown();
  }
});

// =======================
// ====== SEARCH =========
// =======================

const handleSearch = debounce(() => {
  const query = norm(input.value.trim());

  if (!query) return closeDropdown();

  openDropdown();

  let predicted = prefixMap.get(query)?.length || 5;
  predicted = Math.min(predicted, 8);

  showLoader(predicted);

  setTimeout(() => {
    let results = prefixMap.get(query) || fuse.search(query).map(x => x.item);

    if (!results.length) return showNoResults();

    showSuggestions(results.slice(0, 8), query);
  }, 150);

}, 250);

input.addEventListener("input", handleSearch);

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) closeDropdown();
});

// =======================
// ====== INIT ===========
// =======================

fetch("https://vinku.in/data/cities.json")
  .then(res => res.json())
  .then(data => {
    cities = data;
    buildIndex(cities);
    buildCitySet(cities);

    fuse = new Fuse(cities, {
      keys: ["city", "state"],
      threshold: 0.3,
      ignoreLocation: true
    });

    loadRecentSearches();
    saveCurrentPageSearch();
  });

// =======================
// ====== RECENT SEARCH ==
// =======================

const MAX_ITEMS = 10;

function saveSearch(city, state, state_code, category) {
  if (!city && !category) return;

  let searches = JSON.parse(localStorage.getItem("recentSearches")) || [];

  const newItem = { city, state, state_code, category };

  searches = searches.filter(i =>
    !(
      i.city === city && 
      i.state === state && 
      i.state_code === state_code && 
      i.category === category
    )
  );

  searches.unshift(newItem);
  searches = searches.slice(0, MAX_ITEMS);

  localStorage.setItem("recentSearches", JSON.stringify(searches));
}

function buildUrl(state, city, category) {
  if (state && city && category) return `/${state}/${city}/${category}/`;
  if (state && city) return `/${state}/${city}/`;
  if (category) return `/${category}/`;
  return "/";
}

// Save Category Clicks
document.addEventListener("click", (e) => {

  const item = e.target.closest(".menu-item");

  if (!item) return;

  const category = item.dataset.category;

  if (category) {
    saveSearch("", "", "", slugify(category));
  }

});

// =======================
// ====== MAIN SEARCH ====
// =======================

function searchCity() {

  let rawInput = document.getElementById("search").value.trim();
  let rawCategory = document.getElementById("category").value;

  let city = "";
  let state = "";
  let state_code = "";

  if (rawInput) {
    const parts = rawInput.split(",");

    city = parts[0]?.trim();
    state = parts[1]?.trim();

    // find matched city object
    const matchedCity = cities.find(item =>
      slugify(item.city) === slugify(city) &&
      slugify(item.state) === slugify(state)
    );

    if (matchedCity) {
      state_code = matchedCity.state_code || "";
    }
  }

  city = slugify(city);
  state = slugify(state);
  const category = slugify(rawCategory);

  // SAVE
  if (city || category) {

    if (city) {
      if (!isValidCity(city, state)) {
        alert("City not found");
        return;
      }
    }

    saveSearch(city, state, state_code, category);
  }

  // REDIRECT
  window.location.href = buildUrl(state, city, category);
}

// =======================
// ====== RECENT UI ======
// =======================

function loadRecentSearches() {

  const container = document.getElementById("recent-container");
  const wrapper = document.getElementById("recent-chips");

  if (!container || !wrapper) return;

  const searches = JSON.parse(localStorage.getItem("recentSearches")) || [];

  wrapper.innerHTML = "";

  if (!searches.length) {
    container.style.display = "none";
    return;
  }

  container.classList.remove("recent_searches");

  searches.forEach(item => {

    const chip = document.createElement("div");
    chip.className = "chip";

    const url = buildUrl(item.state, item.city, item.category);

    const parts = [];

    if (item.city) parts.push(formatText(item.city));
    if (item.state_code) {
      parts.push(item.state_code.toUpperCase());
    } else if (item.state) {
      parts.push(formatText(item.state));
    }

    let label = parts.join(", ");

    if (item.category) {
      const cat = toTitleCase(item.category);
      label = label ? `${label} (${cat})` : cat;
    }

    chip.innerText = label;

    chip.onclick = () => {

      saveSearch(item.city, item.state, item.state_code, item.category);

      loadRecentSearches();

      window.location.href = url;
    };

    wrapper.appendChild(chip);
  });
}

// Valid Categories
const VALID_CATEGORIES = [
  "escorts",
  "callgirls",
  "high-profiles",
  "college-girls",
  "bhabhis",
  "aunties",
  "housewifes",
  "russians",
  "models"
];
// Valid Categories

// URL Recent Search Sync
function saveCurrentPageSearch() {
  
  const parts = window.location.pathname
  .split("/")
  .filter(Boolean);
  
  let state = "";
  let city = "";
  let category = "";

  // =========================
  // /state/city/category/
  // =========================
  if (parts.length === 3) {
    
    state = slugify(parts[0]);
    city = slugify(parts[1]);
    category = slugify(parts[2]);
    
    // validate city
    if (!isValidCity(city, state)) return;
    
    // validate category
    if (!VALID_CATEGORIES.includes(category)) return;
  }
  
  // =========================
  // /state/city/
  // =========================
  else if (parts.length === 2) {
    
    state = slugify(parts[0]);
    city = slugify(parts[1]);
    
    // validate city
    if (!isValidCity(city, state)) return;
  }
  
  // =========================
  // /category/
  // =========================
  else if (parts.length === 1) {
    
    category = slugify(parts[0]);
    
    // validate category
    if (!VALID_CATEGORIES.includes(category)) return;
  }
  
  else {
    return;
  }
  
  // =========================
  // state code
  // =========================
  let state_code = "";
  
  if (city && state) {
    
    const matchedCity = cities.find(item =>
      slugify(item.city) === city &&
      slugify(item.state) === state
    );
    
    if (!matchedCity) return;
    
    state_code = matchedCity.state_code || "";
  }
  
  saveSearch(city, state, state_code, category);
}
// URL Recent Search Sync

// Clear Recent Searches
function clearRecent() {
  localStorage.removeItem("recentSearches");
  loadRecentSearches();
}
// Clear Recent Searches

// Load recent searches on page load
document.addEventListener("DOMContentLoaded", loadRecentSearches);
// Load recent searches on page load

// Dynamaic Horizontal Scroll
document.addEventListener("DOMContentLoaded", () => {
  
  const menu = document.getElementById("menuWrapper");
  const active = document.querySelector(".menu-item.active_cat");
  
  if(!menu || !active) return;
  
  const left = active.offsetLeft - (menu.clientWidth / 2) + (active.clientWidth / 2);
  // menu.scrollTo({ left, behavior: "smooth" });
  menu.scrollTo({ left});
  
});
// Dynamaic Horizontal Scroll
