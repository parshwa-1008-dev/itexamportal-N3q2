document.addEventListener("DOMContentLoaded", () => {
 const form=document.getElementById("loginForm");
 const message=document.getElementById("message");
 if(!form||!message)return;

 form.addEventListener("submit",async event=>{
  event.preventDefault();
  message.textContent="Signing in...";
  message.style.color="#64748b";

  const payload={
   email:document.getElementById("email").value.trim(),
   password:document.getElementById("password").value,
   code:document.getElementById("code").value.trim()
  };

  try {
   const response=await fetch("/api/admin-control/login",{
    method:"POST",
    credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Login failed.");

   const check=await fetch("/api/admin-control/me",{credentials:"same-origin"});
   if(!check.ok)throw new Error("Login session could not be verified.");

   message.style.color="#067647";
   message.textContent="Login successful. Opening dashboard...";
   window.location.replace("/admin/index.html");
  } catch(error) {
   message.style.color="#b42318";
   message.textContent=error.message;
  }
 });
});
