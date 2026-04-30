const articles = [
  {
    title: "Reset your student or faculty password",
    description: "Follow the self-service steps for campus password recovery and account unlock requests.",
    tag: "Accounts",
    eta: "4 min read",
    keywords: ["password", "reset", "account", "login", "multifactor"]
  },
  {
    title: "Connect to campus Wi-Fi on your laptop or phone",
    description: "Instructions for joining secure wireless service and resolving common authentication problems.",
    tag: "Network",
    eta: "3 min read",
    keywords: ["wifi", "wireless", "network", "eduroam", "internet"]
  },
  {
    title: "Access Brightspace and online learning tools",
    description: "Use your college credentials to sign in, find courses, and troubleshoot missing class access.",
    tag: "Learning",
    eta: "5 min read",
    keywords: ["brightspace", "blackboard", "course", "classes", "portal"]
  },
  {
    title: "Request classroom AV support",
    description: "Report issues with projectors, podium computers, microphones, and presentation displays.",
    tag: "Classroom",
    eta: "2 min read",
    keywords: ["classroom", "projector", "av", "podium", "presentation"]
  },
  {
    title: "Install approved software in labs and offices",
    description: "Submit software requests for academic labs, faculty workstations, and shared campus devices.",
    tag: "Software",
    eta: "6 min read",
    keywords: ["software", "installation", "lab", "adobe", "microsoft"]
  },
  {
    title: "Borrow a loaner laptop or get printing support",
    description: "Find equipment lending options, printing assistance, and next steps for damaged devices.",
    tag: "Devices",
    eta: "4 min read",
    keywords: ["loaner", "laptop", "printer", "printing", "device"]
  }
];

const articleList = document.getElementById("articleList");
const resultsSummary = document.getElementById("resultsSummary");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");

function renderArticles(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const filteredArticles = articles.filter((article) => {
    if (!terms.length) {
      return true;
    }

    const haystack = [article.title, article.description, article.tag, ...article.keywords]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });

  articleList.innerHTML = "";

  filteredArticles.forEach((article) => {
    const card = document.createElement("article");
    card.className = "article-card";
    card.innerHTML = `
      <h3>${article.title}</h3>
      <p>${article.description}</p>
      <div class="article-card__meta">
        <span class="article-card__tag">${article.tag}</span>
        <span>${article.eta}</span>
      </div>
    `;
    articleList.appendChild(card);
  });

  resultsSummary.textContent = filteredArticles.length
    ? `Showing ${filteredArticles.length} help article${filteredArticles.length === 1 ? "" : "s"}`
    : "No exact matches found. Try a broader keyword.";
}

function applyQuery(query) {
  searchInput.value = query;
  renderArticles(query);
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderArticles(searchInput.value);
});

searchInput.addEventListener("input", (event) => {
  renderArticles(event.target.value);
});

document.querySelectorAll("[data-query]").forEach((element) => {
  element.addEventListener("click", () => {
    applyQuery(element.dataset.query);
    document.getElementById("articles").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll(".faq-question").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    const isOpen = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
});

renderArticles();