from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from typing import Optional
import datetime

router = APIRouter()

@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    periodo: Optional[str] = Query(default="todos"),
    produto: Optional[str] = Query(default=None),
    categoria: Optional[str] = Query(default=None),
    data_inicio: Optional[str] = Query(default=None),
    data_fim: Optional[str] = Query(default=None),
):
    def variacao(atual, anterior):
        if anterior == 0:
            return None
        return round(((atual - anterior) / anterior) * 100, 1)

    # Filtros dinâmicos
    filtros = "WHERE 1=1"
    params = {}

    if data_inicio and data_fim:
        filtros += " AND data_venda BETWEEN :data_inicio AND :data_fim"
        params["data_inicio"] = data_inicio
        params["data_fim"]    = data_fim
    elif periodo and periodo != "todos":
        filtros += f" AND data_venda >= CURRENT_DATE - INTERVAL '{periodo} days'"

    if produto and produto != "todos":
        filtros += " AND produto = :produto"
        params["produto"] = produto

    if categoria and categoria != "todos":
        filtros += " AND categoria = :categoria"
        params["categoria"] = categoria

    # Total vendido
    total = db.execute(text(
        f"SELECT COALESCE(SUM(quantidade_kg), 0) FROM historico_vendas {filtros}"
    ), params).fetchone()[0]

    # Média diária
    media = db.execute(text(
        f"""SELECT COALESCE(AVG(diario), 0) FROM (
            SELECT data_venda, SUM(quantidade_kg) AS diario
            FROM historico_vendas {filtros}
            GROUP BY data_venda
        ) t"""
    ), params).fetchone()[0]

    # Mais vendidos
    mais = db.execute(text(
        f"""SELECT produto, SUM(quantidade_kg) AS kg
           FROM historico_vendas {filtros}
           GROUP BY produto ORDER BY kg DESC """
    ), params).fetchall()

    # Menos vendidos — abaixo da média
    menos = db.execute(text(
        f"""SELECT produto, SUM(quantidade_kg) AS kg
           FROM historico_vendas {filtros}
           GROUP BY produto
           HAVING SUM(quantidade_kg) < (
               SELECT AVG(total) FROM (
                   SELECT SUM(quantidade_kg) AS total
                   FROM historico_vendas {filtros}
                   GROUP BY produto
               ) t
           )
           ORDER BY kg ASC """
    ), params).fetchall()

    # Vendas por período
    periodo_dados = db.execute(text(
        f"""SELECT data_venda, SUM(quantidade_kg) AS kg
           FROM historico_vendas {filtros}
           GROUP BY data_venda
           ORDER BY data_venda DESC """
    ), params).fetchall()

    # Datas reais dos dados
    datas = db.execute(text(
        f"SELECT MIN(data_venda), MAX(data_venda) FROM historico_vendas {filtros}"
    ), params).fetchone()

    data_min = datas[0]
    data_max = datas[1]

    # Comparativo — divide o período ao meio
    var_total = None
    var_media = None
    var_top   = None

    # Só calcula comparativo se NÃO for período personalizado
    if not (data_inicio and data_fim) and data_min and data_max:
        intervalo = (data_max - data_min).days + 1
        metade = intervalo // 2
        data_meio = data_min + datetime.timedelta(days=metade)

        sem_atual_params = {**params, "data_meio": data_meio}
        sem_ant_params   = {**params, "data_meio": data_meio}

        filtro_atual = filtros + " AND data_venda > :data_meio"
        filtro_ant   = filtros + " AND data_venda <= :data_meio"

        s_atual = db.execute(text(
            f"SELECT COALESCE(SUM(quantidade_kg), 0) FROM historico_vendas {filtro_atual}"
        ), sem_atual_params).fetchone()[0]

        s_ant = db.execute(text(
            f"SELECT COALESCE(SUM(quantidade_kg), 0) FROM historico_vendas {filtro_ant}"
        ), sem_ant_params).fetchone()[0]

        top_at = db.execute(text(
            f"""SELECT produto, COALESCE(SUM(quantidade_kg), 0) AS kg
               FROM historico_vendas {filtro_atual}
               GROUP BY produto ORDER BY kg DESC LIMIT 1"""
        ), sem_atual_params).fetchone()

        top_an = db.execute(text(
            f"""SELECT COALESCE(SUM(quantidade_kg), 0) AS kg
               FROM historico_vendas {filtro_ant}
               AND produto = :prod"""
        ), {**sem_ant_params, "prod": top_at[0] if top_at else ""}).fetchone()

        dias_atual = max((data_max - data_meio).days, 1)
        dias_ant   = max(metade, 1)

        var_total = variacao(float(s_atual), float(s_ant))
        var_media = variacao(float(s_atual)/dias_atual, float(s_ant)/dias_ant)
        var_top   = variacao(
            float(top_at[1]) if top_at else 0,
            float(top_an[0]) if top_an else 0
        )

    top = mais[0] if mais else None
    low = menos[0] if menos else None

    return {
        "total_vendido":  float(total),
        "media_diaria":   float(media),
        "mais_vendidos":  [{"produto": r[0], "kg": float(r[1])} for r in mais],
        "menos_vendidos": [{"produto": r[0], "kg": float(r[1])} for r in menos],
        "por_periodo":    [{"data": str(r[0]), "kg": float(r[1])} for r in periodo_dados],
        "top_produto":    top[0] if top else "—",
        "top_kg":         float(top[1]) if top else 0,
        "low_produto":    low[0] if low else "—",
        "low_kg":         float(low[1]) if low else 0,
        "var_total":      var_total,
        "var_media":      var_media,
        "var_top":        var_top,
        "data_inicio":    str(data_min) if data_min else None,
        "data_fim":       str(data_max) if data_max else None,
    }

@router.get("/estoque")
def get_estoque(db: Session = Depends(get_db)):
    registros = db.execute(text(
        """SELECT produto, quantidade_kg, cobertura_dias, situacao,
                  data_entrada, dias_estoque, indice_risco, acao_recomendada
           FROM estoque
           ORDER BY
                CASE indice_risco
                    WHEN 'Promoção Urgente' THEN 1
                    WHEN 'Promoção' THEN 2
                    WHEN 'Atenção' THEN 3
                    WHEN 'Comprar' THEN 4
                    ELSE 5
                END, quantidade_kg DESC"""
    )).fetchall()

    return [
        {"nome": r[0], "estoque": float(r[1]),
         "cobertura": float(r[2]), "status": r[3],
         "data_entrada": str(r[4]) if r[4] else None,
         "dias_estoque": r[5] or 0,
         "indice_risco": r[6] or "Normal",
         "acao_recomendada": r[7] or "Monitorar"}
        for r in registros
    ]

@router.get("/filtros")
def get_filtros(db: Session = Depends(get_db)):
    produtos = db.execute(text(
        "SELECT DISTINCT produto FROM historico_vendas ORDER BY produto"
    )).fetchall()
    categorias = db.execute(text(
        "SELECT DISTINCT categoria FROM historico_vendas ORDER BY categoria"
    )).fetchall()
    return {
        "produtos":   [r[0] for r in produtos],
        "categorias": [r[0] for r in categorias],
    }

@router.get("/vendas-dia")
def get_vendas_dia(
    data: str = Query(...),
    db: Session = Depends(get_db)
):
    registros = db.execute(text(
        """SELECT produto, SUM(quantidade_kg) AS kg
           FROM historico_vendas
           WHERE data_venda = :data
           GROUP BY produto
           ORDER BY kg DESC"""
    ), {"data": data}).fetchall()

    return [{"produto": r[0], "kg": float(r[1])} for r in registros]