let businesses = [];

const roleContent = {
  admin: {
    title: "Admin control center",
    description: "Approve listings, monitor content quality, and guide community standards.",
    bullets: [
      "Review pending business approvals",
      "Moderate customer reports and disputes",
      "Manage event promotion requests",
    ],
  },
  business: {
    title: "Business dashboard",
    description: "Create profiles, publish products, and manage bookings with a simple workflow.",
    bullets: [
      "Create a storefront with photos and product listings",
      "Respond to live chat requests in real time",
      "Track bookings, loyalty rewards, and customer activity",
    ],
  },
  customer: {
    title: "Customer experience",
    description: "Discover nearby businesses, make secure purchases, and enjoy loyalty perks.",
    bullets: [
      "Search by category, location, and price range",
      "Book services and pay securely from the app",
      "Save favorite businesses and earn rewards",
    ],
  },
};

const businessList = document.getElementById("businessList");
const categoryFilter = document.getElementById("categoryFilter");
const locationFilter = document.getElementById("locationFilter");
const priceFilter = document.getElementById("priceFilter");
const searchInput = document.getElementById("searchInput");
const rolePanel = document.getElementById("rolePanel");
const roleSwitcher = document.getElementById("roleSwitcher");
const roleButtons = document.querySelectorAll(".role-card");
const toolButtons = document.querySelectorAll(".tool-btn");
const toast = document.getElementById("toast");
const businessForm = document.getElementById("businessForm");
const contactForm = document.getElementById("contactForm");

async function loadBusinesses() {
  try {
    const response = await fetch('/api/businesses');
    const data = await response.json();
    businesses = Array.isArray(data) ? data : [];
    populateFilters();
    renderBusinesses();
  } catch (error) {
    console.error(error);
    showToast('Unable to load businesses right now.');
  }
}

function populateFilters() {
  categoryFilter.innerHTML = '<option value="All">All categories</option>';
  locationFilter.innerHTML = '<option value="All">All locations</option>';
  priceFilter.innerHTML = '<option value="All">All prices</option>';

  const categories = [...new Set(businesses.map((item) => item.category))];
  const locations = [...new Set(businesses.map((item) => item.location))];
  const prices = [...new Set(businesses.map((item) => item.price))];

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });

  locations.forEach((location) => {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    locationFilter.appendChild(option);
  });

  prices.forEach((price) => {
    const option = document.createElement("option");
    option.value = price;
    option.textContent = price;
    priceFilter.appendChild(option);
  });
}

function renderBusinesses() {
  const searchValue = searchInput.value.toLowerCase();
  const categoryValue = categoryFilter.value;
  const locationValue = locationFilter.value;
  const priceValue = priceFilter.value;

  const filtered = businesses.filter((business) => {
    const matchesSearch = [business.name, business.description, business.category]
      .join(" ")
      .toLowerCase()
      .includes(searchValue);
    const matchesCategory = categoryValue === "All" || business.category === categoryValue;
    const matchesLocation = locationValue === "All" || business.location === locationValue;
    const matchesPrice = priceValue === "All" || business.price === priceValue;

    return matchesSearch && matchesCategory && matchesLocation && matchesPrice;
  });

  if (!filtered.length) {
    businessList.innerHTML = '<div class="business-card"><h3>No matches</h3><p>Try a broader search or adjust the filters.</p></div>';
    return;
  }

  businessList.innerHTML = filtered
    .map((business) => {
      const visualClass = business.imageUrl ? 'retail' : business.category.includes('Food') ? 'food' : business.category.includes('Retail') ? 'retail' : 'service';
      return `
        <article class="business-card">
          <div class="business-visual ${visualClass}">${business.tag || 'New listing'}</div>
          <h3>${business.name}</h3>
          <p>${business.description}</p>
          <div class="meta">${business.category} · ${business.location}</div>
          <div class="price">${business.price} · ${business.distance || 'Nearby'}</div>
          ${business.imageUrl ? `<img src="${business.imageUrl}" alt="${business.name}" style="width:100%; border-radius:0.9rem; margin-top:0.7rem; max-height: 160px; object-fit: cover;" />` : ''}
        </article>
      `;
    })
    .join("");
}

function renderRole(role) {
  const content = roleContent[role];
  rolePanel.innerHTML = `
    <h3>${content.title}</h3>
    <p>${content.description}</p>
    <ul>
      ${content.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}
    </ul>
  `;
}

function showToast(message) {
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.style.display = "none";
  }, 1800);
}

loadBusinesses();
renderRole("admin");

[searchInput, categoryFilter, locationFilter, priceFilter].forEach((element) => {
  element.addEventListener("input", renderBusinesses);
  element.addEventListener("change", renderBusinesses);
});

roleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    roleButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const role = button.dataset.role;
    roleSwitcher.textContent = `Explore as ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    renderRole(role);
  });
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    const messages = {
      payment: "Secure payment flow ready for your next checkout.",
      booking: "Booking request created for the selected service.",
      chat: "Live chat opened with the business representative.",
    };
    showToast(messages[action] || "Action ready.");
  });
});

businessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(businessForm);
  const submitButton = businessForm.querySelector("button");
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const response = await fetch("/api/businesses", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Unable to submit listing.");
    }
    showToast("Business listing submitted successfully.");
    businessForm.reset();
    await loadBusinesses();
  } catch (error) {
    showToast(error.message || "Submission failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Create listing";
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(contactForm);
  const submitButton = contactForm.querySelector("button");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Unable to send message.");
    }
    showToast(result.message || "Message sent successfully.");
    contactForm.reset();
  } catch (error) {
    showToast(error.message || "Could not send message.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send message";
  }
});
