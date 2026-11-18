const studentName = document.getElementById("studentName");
const candidateNo = document.getElementById("candidateNo");
const logoutButton = document.getElementById("logoutButton");

async function loadStudentProfile() {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to load student profile.");
    }

    const data = await response.json();
    const user = data.user;

    if (!user || user.role !== "student") {
      window.location.replace("/login.html");
      return;
    }

    studentName.textContent = user.name || "Student";
    candidateNo.textContent = user.candidate_no || user.candidateNo || "Not assigned";

  } catch (error) {
    console.error("Dashboard error:", error);
    studentName.textContent = "Unable to load";
    candidateNo.textContent = "Please refresh";
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "Logging out...";

  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Logout failed.");
    }

    window.location.replace("/login.html");
  } catch (error) {
    console.error(error);
    logoutButton.disabled = false;
    logoutButton.textContent = "Logout";
    alert("Unable to log out. Please try again.");
  }
});

loadStudentProfile();
