const form = document.getElementById("registerForm");
const button = document.getElementById("submitButton");
const message = document.getElementById("message");
const successPanel = document.getElementById("successPanel");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    message.textContent = "Passwords do not match.";
    return;
  }

  if (password.length < 12 || password.length > 72) {
    message.textContent = "Password must be 12–72 characters long.";
    return;
  }

  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Registration failed.");
    }

    if (!data.candidateNo) {
      throw new Error("Candidate number was not returned.");
    }

    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ email, password })
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok || !loginData.user || loginData.user.role !== "student") {
      form.hidden = true;
      successPanel.hidden = false;
      document.getElementById("candidateNumber").textContent = data.candidateNo;
      message.textContent = "";
      return;
    }

    form.hidden = true;
    successPanel.hidden = true;

    const footer = document.querySelector(".card-footer");
    if (footer) footer.hidden = true;

    showCandidateAnimation(data.candidateNo);

  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
    button.textContent = "Create student account →";
  }
});

function showCandidateAnimation(candidateNumber) {
  const overlay = document.createElement("section");
  overlay.className = "seat-number-overlay";
  overlay.setAttribute("role", "button");
  overlay.setAttribute("tabindex", "0");
  overlay.setAttribute("aria-label", "Click anywhere to continue to your dashboard");

  overlay.innerHTML = `
    <div class="seat-number-content">
      <p class="seat-board-heading">itexamportal</p>
      <p class="seat-board-subheading">HIGHER SECONDARY CERTIFICATE</p>
      <hr>
      <p class="seat-registration-label">REGISTRATION SUCCESSFUL</p>
      <h1>YOUR SEAT NUMBER</h1>
      <div class="seat-number-value"></div>
      <p class="seat-note">Keep this number safe for your examination records.</p>
      <hr>
      <p class="seat-continue">CLICK ANYWHERE TO CONTINUE</p>
    </div>
  `;

  overlay.querySelector(".seat-number-value").textContent = candidateNumber;
  document.body.appendChild(overlay);

  let continued = false;

  function continueToDashboard() {
    if (continued) return;
    continued = true;
    window.location.replace("/student/dashboard.html");
  }

  overlay.addEventListener("click", continueToDashboard);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      continueToDashboard();
    }
  });
}

