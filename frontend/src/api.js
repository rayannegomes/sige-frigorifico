// frontend/src/api.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const login = (email, senha) =>
  api.post("/login", { email, senha });

export const uploadPlanilha = (arquivo) => {
  const form = new FormData();
  form.append("arquivo", arquivo);
  return api.post("/upload", form);
};

export const getDashboard = (filtros = {}) => {
  const params = new URLSearchParams();
  if (filtros.periodo && filtros.periodo !== "custom") params.append("periodo", filtros.periodo);
  if (filtros.produto)    params.append("produto",     filtros.produto);
  if (filtros.categoria)  params.append("categoria",   filtros.categoria);
  if (filtros.dataInicio) params.append("data_inicio", filtros.dataInicio);
  if (filtros.dataFim)    params.append("data_fim",    filtros.dataFim);
  return api.get(`/dashboard?${params.toString()}`);
};

export const getFiltros = () =>
  api.get("/filtros");

export const getHistorico = () =>
  api.get("/historico");

export const getEstoque = () =>
  api.get("/estoque");

export const getVendasDia = (data) =>
  api.get(`/vendas-dia?data=${data}`);

export const getUsuarios = () =>
  api.get("/usuarios");

export const criarUsuario = (dados) =>
  api.post("/usuarios", dados);

export const atualizarUsuario = (id, dados) =>
  api.put(`/usuarios/${id}`, dados);

export const excluirUsuario = (id) =>
  api.delete(`/usuarios/${id}`);

export const alterarSenha = (id, dados) =>
  api.put(`/usuarios/${id}/senha`, dados);

export const getUltimaImportacao = () =>
  api.get("/historico?limit=1");

export const deletarImportacao = (id) =>
  api.delete(`/importacao/${id}`);