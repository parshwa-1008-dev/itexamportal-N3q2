const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    if (!data.user || data.user.role !== "student") {
      throw new Error("This login is not a student account.");
    }

    window.location.replace("/student/dashboard.html");

  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
    button.textContent = "Log in →";
  }
});

