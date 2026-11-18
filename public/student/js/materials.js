const materialsList = document.getElementById("materialsList");
const chapterFilter = document.getElementById("chapterFilter");

let allMaterials = [];

function renderMaterials() {
  const selected = chapterFilter.value;

  const filtered = selected === "all"
    ? allMaterials
    : allMaterials.filter(item => item.chapter === selected);

  materialsList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = allMaterials.length
      ? "No materials are available for this chapter yet."
      : "Study materials have not been published yet. Please check again later.";
    materialsList.appendChild(empty);
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement("article");
    card.className = "material-card";

    const tag = document.createElement("span");
    tag.className = "material-tag";
    tag.textContent = item.material_type || "Notes";

    const chapter = document.createElement("p");
    chapter.className = "material-chapter";
    chapter.textContent = item.chapter;

    const title = document.createElement("h2");
    title.textContent = item.title;

    const description = document.createElement("p");
    description.textContent = item.description || "";

    card.append(tag, chapter, title, description);

    if (item.content) {
      const content = document.createElement("div");
      content.className = "material-content";
      content.textContent = item.content;
      card.appendChild(content);
    }

    if (item.file_url && item.file_url.startsWith("/")) {
      const link = document.createElement("a");
      link.className = "material-file";
      link.href = item.file_url;
      link.textContent = "Open study file →";
      card.appendChild(link);
    }

    materialsList.appendChild(card);
  });
}

async function loadMaterials() {
  try {
    const response = await fetch("/api/materials", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to load study materials.");
    }

    const data = await response.json();
    allMaterials = Array.isArray(data.materials) ? data.materials : [];

    const chapters = [...new Set(
      allMaterials.map(item => item.chapter).filter(Boolean)
    )];

    chapters.forEach(chapterName => {
      const option = document.createElement("option");
      option.value = chapterName;
      option.textContent = chapterName;
      chapterFilter.appendChild(option);
    });

    renderMaterials();
  } catch (error) {
    console.error(error);
    materialsList.textContent =
      "Unable to load study materials. Please refresh the page.";
    materialsList.className = "error-state";
  }
}

chapterFilter.addEventListener("change", renderMaterials);

loadMaterials();
