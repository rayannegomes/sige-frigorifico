from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class UsuarioCreate(BaseModel):
    nome: str
    email: str
    senha: str
    perfil: str

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    perfil: Optional[str] = None

class SenhaUpdate(BaseModel):
    senha_atual: str
    nova_senha: str

@router.get("/usuarios")
def listar(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, nome, email, perfil FROM usuarios ORDER BY id"
    )).fetchall()
    return [{"id": r[0], "nome": r[1], "email": r[2], "perfil": r[3]} for r in rows]

@router.post("/usuarios")
def criar(dados: UsuarioCreate, db: Session = Depends(get_db)):
    existe = db.execute(text(
        "SELECT id FROM usuarios WHERE email = :email"
    ), {"email": dados.email}).fetchone()
    if existe:
        raise HTTPException(400, "E-mail já cadastrado")

    db.execute(text(
        """INSERT INTO usuarios (nome, email, senha_hash, perfil)
           VALUES (:nome, :email, :senha, :perfil)"""
    ), {"nome": dados.nome, "email": dados.email,
        "senha": dados.senha, "perfil": dados.perfil})
    db.commit()
    return {"status": "sucesso"}

@router.put("/usuarios/{id}")
def atualizar(id: int, dados: UsuarioUpdate, db: Session = Depends(get_db)):
    if dados.nome:
        db.execute(text("UPDATE usuarios SET nome = :v WHERE id = :id"), {"v": dados.nome, "id": id})
    if dados.email:
        db.execute(text("UPDATE usuarios SET email = :v WHERE id = :id"), {"v": dados.email, "id": id})
    if dados.perfil:
        db.execute(text("UPDATE usuarios SET perfil = :v WHERE id = :id"), {"v": dados.perfil, "id": id})
    db.commit()
    return {"status": "sucesso"}

@router.delete("/usuarios/{id}")
def excluir(id: int, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM usuarios WHERE id = :id"), {"id": id})
    db.commit()
    return {"status": "sucesso"}

@router.put("/usuarios/{id}/senha")
def alterar_senha(id: int, dados: SenhaUpdate, db: Session = Depends(get_db)):
    user = db.execute(text(
        "SELECT id FROM usuarios WHERE id = :id AND senha_hash = :senha"
    ), {"id": id, "senha": dados.senha_atual}).fetchone()
    if not user:
        raise HTTPException(400, "Senha atual incorreta")
    db.execute(text(
        "UPDATE usuarios SET senha_hash = :nova WHERE id = :id"
    ), {"nova": dados.nova_senha, "id": id})
    db.commit()
    return {"status": "sucesso"}