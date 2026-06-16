import pandas as pd
from datetime import datetime

COLUNAS_VENDAS = ["Data", "Produto", "Categoria",
                  "Quantidade (kg)", "Valor Unitario", "Valor Total"]

COLUNAS_ESTOQUE = ["Produto", "Quantidade (kg)", "Data Entrada", "Cobertura (dias)"]

def calcular_situacao(cobertura):
    if cobertura <= 0:
        return "Ruptura"
    elif cobertura < 1:
        return "Baixo"
    elif cobertura <= 3:
        return "Atenção"
    else:
        return "Adequado"

def calcular_risco(dias_estoque, cobertura):
    # Sem estoque
    if cobertura <= 0:
        return "Ruptura", "Produto sem estoque — comprar imediatamente"

    # Estoque crítico — menos de 1 dia
    if cobertura < 1:
        return "Comprar", "Estoque crítico — repor imediatamente"

    # Estoque baixo — menos de 3 dias
    if cobertura < 3:
        # Se produto também está parado há muito tempo
        if dias_estoque >= 15:
            return "Atenção", "Produto parado com baixa cobertura — verificar qualidade e repor"
        else:
            return "Comprar", "Estoque baixo — planejar reposição em breve"

    # Produto parado há muito tempo com estoque alto = promoção
    if dias_estoque >= 30 and cobertura >= 3:
        return "Promoção Urgente", "Produto parado há muito tempo com estoque elevado — promoção urgente"

    if dias_estoque >= 20 and cobertura >= 3:
        return "Promoção", "Fazer promoção ou combo para girar o estoque"

    if dias_estoque >= 15 and cobertura >= 3:
        return "Atenção", "Monitorar — risco de envelhecimento"

    return "Normal", "Estoque saudável"

def processar_planilha(arquivo):
    try:
        xl = pd.ExcelFile(arquivo)
    except Exception:
        raise ValueError("Arquivo inválido. Certifique-se de enviar um arquivo .xlsx ou .xls.")

    # ── Verificar aba Vendas ───────────────────────────────────
    if "Vendas" not in xl.sheet_names:
        raise ValueError(
            f"Aba 'Vendas' não encontrada. "
            f"Abas encontradas: {', '.join(xl.sheet_names)}."
        )

    df_vendas = xl.parse("Vendas", header=1)

    if df_vendas.empty:
        raise ValueError("A aba 'Vendas' está vazia.")

    faltando = [c for c in COLUNAS_VENDAS if c not in df_vendas.columns]
    if faltando:
        raise ValueError(
            f"Colunas ausentes na aba 'Vendas': {', '.join(faltando)}. "
            f"Colunas obrigatórias: {', '.join(COLUNAS_VENDAS)}."
        )

    # Validar dados
    erros = []
    df_vendas["Data_parsed"] = pd.to_datetime(df_vendas["Data"], dayfirst=True, errors="coerce")
    linhas_data = df_vendas[df_vendas["Data_parsed"].isna()].index.tolist()
    if linhas_data:
        erros.append(f"Coluna 'Data' com valores inválidos nas linhas: {[i+2 for i in linhas_data]}")

    df_vendas["Quantidade (kg)"] = pd.to_numeric(df_vendas["Quantidade (kg)"], errors="coerce")
    linhas_qtd = df_vendas[df_vendas["Quantidade (kg)"].isna()].index.tolist()
    if linhas_qtd:
        erros.append(f"Coluna 'Quantidade (kg)' com valores inválidos nas linhas: {[i+2 for i in linhas_qtd]}")

    df_vendas["Valor Total"] = pd.to_numeric(df_vendas["Valor Total"], errors="coerce")
    linhas_sem_produto = df_vendas[df_vendas["Produto"].isna()].index.tolist()
    if linhas_sem_produto:
        erros.append(f"Coluna 'Produto' vazia nas linhas: {[i+2 for i in linhas_sem_produto]}")

    if erros:
        raise ValueError("Erros encontrados:\n" + "\n".join(f"• {e}" for e in erros))

    df_vendas = df_vendas.dropna(subset=["Produto", "Quantidade (kg)"])
    df_vendas["Data"] = df_vendas["Data_parsed"]

    # ── Processar aba Estoque ──────────────────────────────────
    df_estoque = None
    if "Estoque" in xl.sheet_names:
        df_estoque = xl.parse("Estoque", header=1)  # linha 2 é o cabeçalho

        if not df_estoque.empty:
            faltando_e = [c for c in ["Produto", "Quantidade (kg)", "Cobertura (dias)"]
                          if c not in df_estoque.columns]
            if faltando_e:
                raise ValueError(f"Colunas ausentes na aba 'Estoque': {', '.join(faltando_e)}")

            df_estoque = df_estoque.dropna(subset=["Produto"])
            df_estoque["Quantidade (kg)"] = pd.to_numeric(
                df_estoque["Quantidade (kg)"], errors="coerce").fillna(0)

            # Calcular cobertura usando os dados de vendas da planilha
            # Média diária = total vendido / número de dias com venda
            if not df_vendas.empty:
                vendas_por_produto = df_vendas.groupby("Produto").agg(
                    total_kg=("Quantidade (kg)", "sum"),
                    dias_com_venda=("Data", "nunique")
                ).reset_index()
                vendas_por_produto["media_diaria"] = (
                    vendas_por_produto["total_kg"] / vendas_por_produto["dias_com_venda"]
                )
                media_dict = dict(zip(vendas_por_produto["Produto"], vendas_por_produto["media_diaria"]))
                
                def calc_cobertura(row):
                    media = media_dict.get(row["Produto"], 0)
                    if media == 0:
                        return 0
                    return round(row["Quantidade (kg)"] / media, 1)
                
                df_estoque["Cobertura (dias)"] = df_estoque.apply(calc_cobertura, axis=1)
            else:
                df_estoque["Cobertura (dias)"] = pd.to_numeric(
                    df_estoque["Cobertura (dias)"], errors="coerce").fillna(0)

            # Calcular situação automaticamente
            df_estoque["Situacao"] = df_estoque["Cobertura (dias)"].apply(calcular_situacao)

            # Sempre calcular dias em estoque pela Data Entrada
            hoje = pd.Timestamp.now().normalize()
            if "Data Entrada" in df_estoque.columns:
                df_estoque["Data Entrada parsed"] = pd.to_datetime(
                    df_estoque["Data Entrada"].astype(str), dayfirst=True, errors="coerce")
                df_estoque["dias_estoque"] = (
                    hoje - df_estoque["Data Entrada parsed"]
                ).dt.days.fillna(0).astype(int)
                df_estoque["Data Entrada"] = df_estoque["Data Entrada parsed"]
                print("DEBUG dias_estoque:", df_estoque[["Produto","dias_estoque","Cobertura (dias)"]].to_string())
            else:
                df_estoque["dias_estoque"] = 0
                print("DEBUG: coluna Data Entrada não encontrada")
            
            print("DEBUG colunas:", df_estoque.columns.tolist())

            # Data entrada
            if "Data Entrada" in df_estoque.columns:
                df_estoque["Data Entrada"] = pd.to_datetime(
                    df_estoque["Data Entrada"], dayfirst=True, errors="coerce")

            # Calcular índice de risco e ação recomendada
            df_estoque["indice_risco"] = df_estoque.apply(
                lambda r: calcular_risco(int(r["dias_estoque"]), float(r["Cobertura (dias)"]))[0], axis=1)
            df_estoque["acao_recomendada"] = df_estoque.apply(
                lambda r: calcular_risco(int(r["dias_estoque"]), float(r["Cobertura (dias)"]))[1], axis=1)


    return {
        "vendas":  df_vendas.to_dict(orient="records"),
        "estoque": df_estoque.to_dict(orient="records") if df_estoque is not None and not df_estoque.empty else [],
        "total_vendas": len(df_vendas),
        "total_estoque": len(df_estoque) if df_estoque is not None else 0,
    }