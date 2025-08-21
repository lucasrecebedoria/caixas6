
import { getAuth, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const auth = getAuth();

// Mostrar badge com nome + matrícula
auth.onAuthStateChanged(user => {
  if (user) {
    const matricula = user.email.split("@")[0];
    const badge = document.getElementById("userBadge");
    if (["4144","70029","6266"].includes(matricula)) {
      badge.innerText = `Admin ${matricula}`;
      badge.style.background = "linear-gradient(90deg, gold, goldenrod)";
      badge.style.color = "#000";
    } else {
      badge.innerText = `Usuário ${matricula}`;
      badge.style.background = "linear-gradient(90deg, green, darkgreen)";
      badge.style.color = "#fff";
    }
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "login.html";
  }).catch((error) => {
    alert("Erro ao sair: " + error.message);
  });
});

// Alterar senha
document.getElementById("changePasswordBtn").addEventListener("click", () => {
  const newPass = prompt("Digite a nova senha:");
  if (!newPass) return;
  const user = auth.currentUser;
  if (user) {
    updatePassword(user, newPass).then(() => {
      alert("Senha alterada com sucesso!");
    }).catch(err => alert("Erro: " + err.message));
  }
});
