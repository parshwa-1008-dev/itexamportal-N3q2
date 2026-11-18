const chapterFilter = document.getElementById("chapterFilter");
const progress = document.getElementById("progress");
const questionArea = document.getElementById("questionArea");
const questionText = document.getElementById("questionText");
const chapterName = document.getElementById("chapterName");
const optionsArea = document.getElementById("options");
const feedback = document.getElementById("feedback");
const checkButton = document.getElementById("checkButton");
const nextButton = document.getElementById("nextButton");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const scoreArea = document.getElementById("scoreArea");

let questions = [];
let currentIndex = 0;
let score = 0;
let answered = false;

async function loadQuestions() {
  questionArea.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  scoreArea.hidden = true;
  progress.textContent = "Loading questions...";

  try {
    const response = await fetch("/api/practice/questions", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) throw new Error("Unable to load questions.");

    const data = await response.json();
    questions = Array.isArray(data.questions) ? data.questions : [];

    const chapters = [...new Set(
      questions.map(question => question.chapter).filter(Boolean)
    )];

    const previous = chapterFilter.value;
    chapterFilter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All available chapters";
    chapterFilter.appendChild(allOption);

    chapters.forEach(chapter => {
      const option = document.createElement("option");
      option.value = chapter;
      option.textContent = chapter;
      chapterFilter.appendChild(option);
    });

    if ([...chapterFilter.options].some(option => option.value === previous)) {
      chapterFilter.value = previous;
    }

    currentIndex = 0;
    score = 0;
    showCurrentQuestion();
  } catch (error) {
    console.error(error);
    progress.textContent = "";
    errorState.textContent = error.message;
    errorState.hidden = false;
  }
}

function getFilteredQuestions() {
  const chapter = chapterFilter.value;
  return chapter === "all"
    ? questions
    : questions.filter(question => question.chapter === chapter);
}

function showCurrentQuestion() {
  const list = getFilteredQuestions();

  feedback.textContent = "";
  nextButton.hidden = true;
  checkButton.hidden = false;
  checkButton.disabled = true;
  answered = false;

  if (!list.length) {
    questionArea.hidden = true;
    scoreArea.hidden = true;
    emptyState.hidden = false;
    progress.textContent = "No questions available";
    return;
  }

  if (currentIndex >= list.length) {
    questionArea.hidden = true;
    emptyState.hidden = true;
    scoreArea.hidden = false;
    progress.textContent = "Practice completed";
    document.getElementById("scoreText").textContent =
      `Your score: ${score} out of ${list.length}`;
    return;
  }

  const question = list[currentIndex];

  emptyState.hidden = true;
  scoreArea.hidden = true;
  questionArea.hidden = false;

  progress.textContent =
    `Question ${currentIndex + 1} of ${list.length} · Score: ${score}`;

  chapterName.textContent = question.chapter;
  questionText.textContent = question.question;
  optionsArea.replaceChildren();

  ["A", "B", "C", "D"].forEach(letter => {
    const label = document.createElement("label");
    label.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "practiceAnswer";
    radio.value = letter;

    const text = document.createElement("span");
    text.textContent = `${letter}. ${question.options[letter]}`;

    radio.addEventListener("change", () => {
      checkButton.disabled = false;
    });

    label.append(radio, text);
    optionsArea.appendChild(label);
  });
}

async function checkAnswer() {
  if (answered) return;

  const selected = document.querySelector(
    'input[name="practiceAnswer"]:checked'
  );

  if (!selected) return;

  checkButton.disabled = true;
  checkButton.textContent = "Checking...";

  try {
    const question = getFilteredQuestions()[currentIndex];

    const response = await fetch(
      `/api/practice/questions/${question.id}/answer`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOption: selected.value })
      }
    );

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to check answer.");
    }

    answered = true;

    if (data.isCorrect) {
      score++;
      feedback.textContent = "Correct answer!";
    } else {
      feedback.textContent = "That answer is incorrect.";
    }

    if (data.explanation) {
      feedback.textContent += "\n\nExplanation: " + data.explanation;
    }

    optionsArea.querySelectorAll("input").forEach(input => {
      input.disabled = true;
    });

    checkButton.hidden = true;
    nextButton.hidden = false;
    nextButton.textContent =
      currentIndex + 1 >= getFilteredQuestions().length
        ? "View Score"
        : "Next Question";

    progress.textContent =
      `Question ${currentIndex + 1} of ${getFilteredQuestions().length} · Score: ${score}`;

  } catch (error) {
    feedback.textContent = error.message;
    checkButton.disabled = false;
  } finally {
    checkButton.textContent = "Check Answer";
  }
}

checkButton.addEventListener("click", checkAnswer);

nextButton.addEventListener("click", () => {
  if (!answered) return;
  currentIndex++;
  showCurrentQuestion();
});

chapterFilter.addEventListener("change", () => {
  currentIndex = 0;
  score = 0;
  showCurrentQuestion();
});

document.getElementById("restartButton").addEventListener("click", () => {
  currentIndex = 0;
  score = 0;
  showCurrentQuestion();
});

loadQuestions();
