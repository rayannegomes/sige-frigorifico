from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from services.excel_parser import processar_planilha
import io
import pandas as pd

router = APIRouter()

@router.post("/upload")
async def upload(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    if not arquivo.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Formato inválido. Use .xlsx ou .xls")

    conteudo = await arquivo.read()

    try:
        resultado = processar_planilha(io.BytesIO(conteudo))
    except ValueError as e:
        # Registrar importação com erro
        db.execute(text(
            """INSERT INTO importacoes (nome_arquivo, status, mensagem_erro)
               VALUES (:nome, 'erro', :erro)"""
        ), {"nome": arquivo.filename, "erro": str(e)})
        db.commit()
        raise HTTPException(422, str(e))

    vendas   = resultado["vendas"]
    estoque  = resultado["estoque"]
    tot_v    = resultado["total_vendas"]
    tot_e    = resultado["total_estoque"]

    detalhes = f"Vendas: {tot_v} registros importados. Estoque: {tot_e} produtos atualizados."

    # Registrar importação com sucesso
    importacao = db.execute(text(
        """INSERT INTO importacoes
           (nome_arquivo, status, total_vendas, total_estoque, detalhes)
           VALUES (:nome, 'sucesso', :tv, :te, :det)
           RETURNING id"""
    ), {"nome": arquivo.filename, "tv": tot_v, "te": tot_e, "det": detalhes}).fetchone()

    # Salvar vendas
# Pegar datas da planilha importada
    datas_planilha = list(set([str(r["Data"])[:10] for r in vendas]))

    # Apagar vendas existentes para essas datas (evita duplicação)
    for data in datas_planilha:
        db.execute(text(
            "DELETE FROM historico_vendas WHERE data_venda = :data"
        ), {"data": data})

    # Salvar vendas novas
    for r in vendas:
        db.execute(text(
            """INSERT INTO historico_vendas
               (importacao_id, data_venda, produto, categoria,
                quantidade_kg, valor_unitario, valor_total)
               VALUES (:imp, :data, :prod, :cat, :qtd, :vun, :vtot)"""
        ), {"imp":  importacao[0],
            "data": str(r["Data"])[:10],
            "prod": r["Produto"],
            "cat":  r.get("Categoria", ""),
            "qtd":  r["Quantidade (kg)"],
            "vun":  r.get("Valor Unitario", 0),
            "vtot": r["Valor Total"]})

    # Salvar estoque
    if estoque:
        db.execute(text("DELETE FROM estoque"))
        for e in estoque:
            db.execute(text(
                """INSERT INTO estoque
                   (produto, quantidade_kg, cobertura_dias, situacao,
                    data_entrada, dias_estoque, indice_risco, acao_recomendada)
                   VALUES (:prod, :qtd, :cob, :sit, :de, :ds, :ir, :ar)
                   ON CONFLICT (produto) DO UPDATE
                   SET quantidade_kg = :qtd, cobertura_dias = :cob,
                       situacao = :sit, data_entrada = :de,
                       dias_estoque = :ds, indice_risco = :ir,
                       acao_recomendada = :ar, atualizado_em = NOW()"""
            ), {
                "prod": e["Produto"],
                "qtd":  e["Quantidade (kg)"],
                "cob":  e["Cobertura (dias)"],
                "sit":  e["Situacao"],
                "de":   str(e.get("Data Entrada", ""))[:10] if pd.notna(e.get("Data Entrada")) else None,
                "ds":   int(e.get("dias_estoque", 0)),
                "ir":   e.get("indice_risco", "Normal"),
                "ar":   e.get("acao_recomendada", "Monitorar")
                })

    db.commit()

    return {
        "status": "sucesso",
        "vendas_importadas": tot_v,
        "estoque_atualizado": tot_e,
        "detalhes": detalhes
    }

@router.get("/historico")
def historico(db: Session = Depends(get_db)):
    registros = db.execute(text(
        """SELECT id, nome_arquivo, status, mensagem_erro,
                  data_importacao, total_vendas, total_estoque, detalhes
           FROM importacoes
           ORDER BY data_importacao DESC
           LIMIT 20"""
    )).fetchall()

    return [
        {"id": r[0], "arquivo": r[1], "status": r[2],
         "erro": r[3], "data": str(r[4]),
         "total_vendas": r[5], "total_estoque": r[6], "detalhes": r[7]}
        for r in registros
    ]

@router.delete("/importacao/{id}")
def deletar_importacao(id: int, db: Session = Depends(get_db)):
    # Buscar importação
    imp = db.execute(text(
        "SELECT id FROM importacoes WHERE id = :id"
    ), {"id": id}).fetchone()
    
    if not imp:
        raise HTTPException(404, "Importação não encontrada")
    
    # Apagar vendas relacionadas
    db.execute(text(
        "DELETE FROM historico_vendas WHERE importacao_id = :id"
    ), {"id": id})
    
    # Apagar importação
    db.execute(text(
        "DELETE FROM importacoes WHERE id = :id"
    ), {"id": id})
    
    db.commit()
    return {"status": "sucesso"}