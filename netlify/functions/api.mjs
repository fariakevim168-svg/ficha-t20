import { getStore } from "@netlify/blobs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const enc = (u) => "p:" + encodeURIComponent(u);

export default async (req) => {
  if (req.method !== "POST") return J({ erro: "Método inválido" }, 405);
  const b = await req.json().catch(() => ({}));
  const st = getStore("t20");
  const user = String(b.user || "").trim().toLowerCase().slice(0, 30);
  const pin = String(b.pin || "");
  if (!user || !pin) return J({ erro: "Informe nome e senha" }, 400);
  const mestre = user === "mestre";

  let rec = null;
  if (mestre) {
    if (b.act === "registrar") return J({ erro: "Esse nome é reservado" }, 409);
    if (!process.env.MASTER_PIN || pin !== process.env.MASTER_PIN) return J({ erro: "Senha do mestre incorreta" }, 401);
  } else {
    rec = await st.get(enc(user), { type: "json" });
    if (b.act === "registrar") {
      if (rec) return J({ erro: "Já existe um jogador com esse nome" }, 409);
      if (pin.length < 4) return J({ erro: "A senha precisa ter ao menos 4 caracteres" }, 400);
      rec = { pin, sheet: {} };
      await st.setJSON(enc(user), rec);
    } else if (!rec) return J({ erro: "Conta não encontrada. Use Criar conta." }, 401);
    else if (rec.pin !== pin) return J({ erro: "Senha incorreta" }, 401);
  }

  const todos = async () => (await st.get("itens", { type: "json" })) || [];
  const itens = async () => (mestre ? await todos() : (await todos()).filter((i) => i.visivel));

  switch (b.act) {
    case "login":
    case "registrar":
      return J({ mestre, sheet: rec?.sheet || {}, itens: await itens() });
    case "save": {
      const alvo = mestre && b.alvo ? b.alvo : user;
      const r = await st.get(enc(alvo), { type: "json" });
      if (!r) return J({ erro: "Ficha não encontrada" }, 404);
      if (JSON.stringify(b.sheet).length > 100000) return J({ erro: "Ficha grande demais" }, 413);
      await st.setJSON(enc(alvo), { ...r, sheet: b.sheet });
      return J({ ok: true });
    }
    case "itens":
      return J({ itens: await itens() });
  }

  if (!mestre) return J({ erro: "Apenas o mestre pode fazer isso" }, 403);
  switch (b.act) {
    case "list": {
      const { blobs } = await st.list({ prefix: "p:" });
      const fichas = [];
      for (const { key } of blobs) {
        const r = await st.get(key, { type: "json" });
        if (r) fichas.push({ nome: decodeURIComponent(key.slice(2)), sheet: r.sheet });
      }
      return J({ fichas });
    }
    case "del":
      await st.delete(enc(b.alvo));
      return J({ ok: true });
    case "item": {
      const lista = await todos();
      const i = lista.findIndex((x) => x.id === b.item.id);
      if (i >= 0) lista[i] = b.item; else lista.push(b.item);
      await st.setJSON("itens", lista);
      return J({ ok: true });
    }
    case "itemdel":
      await st.setJSON("itens", (await todos()).filter((x) => x.id !== b.id));
      return J({ ok: true });
  }
  return J({ erro: "Ação desconhecida" }, 400);
};
