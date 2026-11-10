const currentPath = () => typeof location === "undefined" ? "/plataforma/professor.html" : location.pathname;
const currentSearch = () => typeof location === "undefined" ? "" : location.search;
const ROOT = "./";
const ROOT_MOSTRA = currentPath().endsWith("/mostra-cultural.html");
const PREFIX = ROOT_MOSTRA ? "./plataforma/" : ROOT;
const PLATFORM_HOME = ROOT_MOSTRA ? "./" : "../";

export const ADMIN_MODULES = Object.freeze([
  { id: "home", label: "Visão geral", href: `${PREFIX}professor.html#inicio`, group: "Menu principal", icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
  { id: "reports", label: "Relatórios acadêmicos", href: `${PREFIX}estatistica.html`, group: "Ferramentas acadêmicas", icon: '<path d="M4 19V5M4 19h17"/><rect x="7" y="11" width="3" height="6" rx=".5"/><rect x="13" y="7" width="3" height="10" rx=".5"/><rect x="19" y="4" width="2" height="13" rx=".5"/>' },
  { id: "diary", label: "Diário de classe", href: `${PREFIX}diario-teste.html`, group: "Ferramentas acadêmicas", icon: '<path d="M7 3h11a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v18M12 8h5M12 12h5M12 16h5"/>' },
  { id: "grader", label: "Corretor de avaliações", href: `${PREFIX}corretor-v2.html?v=20261110ux1`, group: "Ferramentas acadêmicas", icon: '<path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>' },
  { id: "notices", label: "Central de avisos", href: `${PREFIX}mensagens.html`, group: "Ferramentas acadêmicas", icon: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>' },
  { id: "closure", label: "Fechamento de bimestre", href: `${PREFIX}fechamento-bimestre.html`, group: "Ferramentas acadêmicas", icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18M8 13h3M8 17h8"/>' },
  { id: "festival", label: "Festival da Consciência Negra", href: `${PREFIX}festival-consciencia-negra-admin.html`, group: "Projetos e eventos", icon: '<path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1M8 14.5a4 4 0 1 1 8 0c0 1.6-.8 2.4-1.7 3.3-.6.6-.8 1.1-.8 2.2h-3c0-1.1-.2-1.6-.8-2.2C8.8 16.9 8 16.1 8 14.5Z"/>' },
  { id: "show", label: "Avaliação da Mostra Cultural", href: ROOT_MOSTRA ? "./mostra-cultural.html?admin=1" : "../mostra-cultural.html?admin=1", group: "Projetos e eventos", icon: '<path d="M4 19V5l8-3 8 3v14l-8 3-8-3Z"/><path d="m4 5 8 3 8-3M12 8v14"/>' },
]);

export function activeAdminModule(pathname = currentPath(), search = currentSearch()) {
  const path = pathname.split("/").pop() || "";
  if (path === "professor.html" || path === "") return "home";
  if (path === "diario-teste.html") return "diary";
  if (/^estatistica(?:-(?:individual|turma|acessos))?\.html$/.test(path)) return "reports";
  if (path === "corretor-v2.html") return "grader";
  if (path === "mensagens.html") return "notices";
  if (path === "fechamento-bimestre.html") return "closure";
  if (path === "festival-consciencia-negra-admin.html") return "festival";
  if (path === "mostra-cultural.html" && new URLSearchParams(search).get("admin") === "1") return "show";
  return "";
}

export function renderAdminShell({ pathname = currentPath(), search = currentSearch(), platformHref = PLATFORM_HOME, active = activeAdminModule(pathname, search) } = {}) {
  const groups = [...new Set(ADMIN_MODULES.map(item => item.group))];
  const nav = groups.map((group, groupIndex) => {
    const items = ADMIN_MODULES.filter(item => item.group === group).map(item => `<a class="teacher-shell-link${item.id === active ? " active" : ""}" href="${item.href}"${item.id === active ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg><span>${item.label}</span></a>`).join("");
    return `${groupIndex ? '<div class="teacher-shell-divider" aria-hidden="true"></div>' : ""}<div class="teacher-shell-caption">${group}</div>${items}`;
  }).join("");
  return `<header class="teacher-shell-topbar"><div class="teacher-shell-brandzone"><button class="teacher-shell-toggle" id="teacherShellToggle" type="button" aria-label="Abrir menu" aria-controls="teacherShellSidebar" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a class="teacher-shell-brand" href="${PREFIX}professor.html#inicio" aria-label="SALTA — Área do Professor"><span class="teacher-shell-brand-mark">S</span><span class="teacher-shell-brand-copy"><strong>SALTA</strong><small>PORTAL EDUCACIONAL</small></span></a></div><div class="teacher-shell-actions"><span class="teacher-shell-context">AMBIENTE ADMINISTRATIVO</span><a class="teacher-shell-home" href="${platformHref}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"/></svg>Plataforma SALTA</a></div></header><aside class="teacher-shell-sidebar" id="teacherShellSidebar" aria-label="Navegação administrativa">${nav}</aside><button class="teacher-shell-overlay" id="teacherShellOverlay" type="button" tabindex="-1" aria-label="Fechar menu"></button>`;
}

export function mountAdminShell(documentRef = document) {
  const mount = documentRef.querySelector("[data-salta-admin-shell]");
  if (!mount) return false;
  mount.innerHTML = renderAdminShell();
  const toggle = mount.querySelector("#teacherShellToggle");
  const overlay = mount.querySelector("#teacherShellOverlay");
  const close = ({ returnFocus = false } = {}) => {
    documentRef.body.classList.remove("teacher-nav-open");
    toggle?.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle?.focus();
  };
  toggle?.addEventListener("click", () => {
    const open = documentRef.body.classList.toggle("teacher-nav-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  overlay?.addEventListener("click", () => close({ returnFocus: true }));
  mount.querySelectorAll(".teacher-shell-sidebar a").forEach(link => link.addEventListener("click", () => close()));
  documentRef.addEventListener("keydown", event => { if (event.key === "Escape") close({ returnFocus: true }); });
  return true;
}

if (typeof document !== "undefined") mountAdminShell();
