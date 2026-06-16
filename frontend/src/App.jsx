import { useState, useRef, useCallback, useEffect } from "react";
import { login, 
        uploadPlanilha, 
        getDashboard, 
        getHistorico, 
        getEstoque, 
        getFiltros, 
        getVendasDia, 
        getUsuarios, 
        criarUsuario, 
        atualizarUsuario, 
        excluirUsuario, 
        alterarSenha,
        deletarImportacao } from "./api";
import * as XLSX from "xlsx";


// ── Paleta ────────────────────────────────────────────────────────────────────
const navy   = "#0D1B2A";
const navyM  = "#112236";
const red    = "#C0202A";
const redH   = "#E02030";
const white  = "#FFFFFF";
const offW   = "#F5F6FA";
const border = "#DDE1EA";
const txt    = "#1A2340";
const muted  = "#64748B";
const green  = "#16A34A";
const orange = "#D97706";
const blue   = "#1D6FD8";


// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtKg(n){ return n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" kg"; }
function statusColor(s){
  if(s==="Adequado") return green;
  if(s==="Atenção")  return orange;
  return red;
}
function statusBg(s){
  if(s==="Adequado") return "#DCFCE7";
  if(s==="Atenção")  return "#FEF3C7";
  return "#FEE2E2";
}

// ── Sparkline Chart ───────────────────────────────────────────────────────────
function LineChart({ data, days, dates, detalhesDias={} }){
  const [hover, setHover] = useState(null);

  const W=900, H=220, pad={t:20,b:40,l:44,r:10};
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b;
  const max=Math.max(...data)*1.1||1, min=0;
  const xS=(i)=>pad.l+i*(iW/(data.length-1));
  const yS=(v)=>pad.t+iH-(((v-min)/(max-min||1))*iH);
  const pts=data.map((v,i)=>`${xS(i)},${yS(v)}`).join(" ");
  const area=`M${xS(0)},${yS(data[0])} `+data.map((v,i)=>`L${xS(i)},${yS(v)}`).join(" ")+` L${xS(data.length-1)},${H-pad.b} L${xS(0)},${H-pad.b} Z`;
  const gridVals=[0, Math.round(max*0.25), Math.round(max*0.5), Math.round(max*0.75), Math.round(max)];

  const detalhe = hover !== null && dates?.[hover] ? detalhesDias[dates[hover]] : null;

  return(
    <div style={{position:"relative"}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={blue} stopOpacity={0.3}/>
            <stop offset="100%" stopColor={blue} stopOpacity={0}/>
          </linearGradient>
        </defs>
        {gridVals.map(v=>(
          <g key={v}>
            <line x1={pad.l} x2={W-pad.r} y1={yS(v)} y2={yS(v)} stroke={border} strokeWidth={0.8} strokeDasharray="4,3"/>
            <text x={pad.l-6} y={yS(v)+4} textAnchor="end" fontSize={9} fill={muted}>{v}</text>
          </g>
        ))}
        <path d={area} fill="url(#cg)"/>
        <polyline points={pts} fill="none" stroke={blue} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((v,i)=>(
          <g key={i}>
            <circle
              cx={xS(i)} cy={yS(v)} r={hover===i?8:5}
              fill={hover===i?blue:white} stroke={blue} strokeWidth={2}
              style={{cursor:"pointer",transition:"r .15s"}}
              onMouseEnter={()=>setHover(i)}
              onMouseLeave={()=>setHover(null)}
            />
            <text x={xS(i)} y={H-pad.b+14} textAnchor="middle" fontSize={9} fill={muted}>
              {days[i]}
            </text>
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div style={{
          position:"absolute",
          left: `${(hover/(data.length-1))*82 + 3}%`,
          top: 0,
          background:navy,
          borderRadius:10,
          padding:"12px 16px",
          minWidth:220,
          zIndex:10,
          boxShadow:"0 4px 20px #0004",
          pointerEvents:"none",
          transform: hover > data.length/2 ? "translateX(-100%)" : "translateX(0)",
        }}>
          <div style={{fontSize:11,fontWeight:700,color:white,marginBottom:8,borderBottom:"1px solid #ffffff22",paddingBottom:6}}>
            📅 {dates?.[hover] ? new Date(dates[hover]+"T12:00:00").toLocaleDateString("pt-BR") : days?.[hover]}
          </div>
          {!detalhe
            ? <div style={{color:"#A8B9CC",fontSize:11}}>Carregando...</div>
            : detalhe.length === 0
              ? <div style={{color:"#A8B9CC",fontSize:11}}>Sem vendas neste dia</div>
              : <>
                  <div style={{fontSize:10,color:"#A8B9CC",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Carnes vendidas</div>
                  {detalhe.slice(0,5).map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:4}}>
                      <span style={{fontSize:11,color: i===0?"#4ADE80":i===detalhe.length-1&&detalhe.length>1?"#FCA5A5":"#A8B9CC"}}>
                        {i===0?"🏆":""} {r.produto}
                      </span>
                      <span style={{fontSize:11,fontWeight:700,color:white}}>{r.kg.toLocaleString("pt-BR",{minimumFractionDigits:2})} kg</span>
                    </div>
                  ))}
                  {detalhe.length > 5 && (
                    <div style={{fontSize:10,color:"#A8B9CC",marginTop:4}}>+{detalhe.length-5} outros produtos</div>
                  )}
                  <div style={{marginTop:8,paddingTop:6,borderTop:"1px solid #ffffff22",display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:10,color:"#A8B9CC"}}>Total do dia</span>
                    <span style={{fontSize:11,fontWeight:700,color:blue}}>{data[hover].toLocaleString("pt-BR",{minimumFractionDigits:2})} kg</span>
                  </div>
                </>
          }
        </div>
      )}
    </div>
  );
}

function BarChart({ data, color=blue }){
  const [hover, setHover] = useState(null);
  if(!data||data.length===0) return null;
  const max = Math.max(...data.map(d=>d.kg))*1.1||1;
  const W=460, H=160, pad={t:20,b:40,l:10,r:10};
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b;
  const bW = Math.min(40, (iW/data.length)*0.6);
  const gap = iW/data.length;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      {data.map((d,i)=>{
        const x = pad.l + i*gap + gap/2 - bW/2;
        const bH = (d.kg/max)*iH;
        const y = pad.t + iH - bH;
        return(
          <g key={i}
            onMouseEnter={()=>setHover(i)}
            onMouseLeave={()=>setHover(null)}
            style={{cursor:"pointer"}}>
            <rect x={x} y={y} width={bW} height={bH} rx={4}
              fill={hover===i?`${color}dd`:color} opacity={hover!==null&&hover!==i?0.5:1}
              style={{transition:"opacity .2s"}}/>
            {hover===i&&(
              <g>
                <rect x={x+bW/2-36} y={y-28} width={72} height={22} rx={5} fill={navy}/>
                <text x={x+bW/2} y={y-13} textAnchor="middle" fontSize={10} fill={white} fontWeight={700}>
                  {d.kg.toLocaleString("pt-BR",{minimumFractionDigits:2})} kg
                </text>
              </g>
            )}
            <text x={x+bW/2} y={H-pad.b+12} textAnchor="middle" fontSize={8} fill={muted}
              style={{overflow:"hidden"}}>
              {String(d.produto??d.nome).slice(0,10)}
            </text>
          </g>
        );
      })}
      <line x1={pad.l} x2={W-pad.r} y1={pad.t+iH} y2={pad.t+iH} stroke={border} strokeWidth={1}/>
    </svg>
  );
}

function PieChart({ data, colors=[blue,red,green,orange,"#B388FF","#9CA3AF"] }){
  const [hover, setHover] = useState(null);
  if(!data||data.length===0) return null;
  const total = data.reduce((s,d)=>s+(d.kg||0),0)||1;
  const R=60, cx=80, cy=75;
  let cum=0;
  const segments = data.slice(0,6).map((d,i)=>{
    const pct = d.kg/total;
    const start = cum;
    cum += pct;
    const a1=(start*2*Math.PI)-Math.PI/2;
    const a2=(cum*2*Math.PI)-Math.PI/2;
    const x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1);
    const x2=cx+R*Math.cos(a2), y2=cy+R*Math.sin(a2);
    const large=pct>0.5?1:0;
    const midA = (a1+a2)/2;
    return { d:`M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z`,
      color:colors[i%colors.length], label:d.produto??d.nome, kg:d.kg, pct, midA };
  });
  return(
    <svg width="100%" viewBox="0 0 260 150" style={{overflow:"visible"}}>
      {segments.map((s,i)=>(
        <path key={i} d={s.d}
          fill={s.color}
          opacity={hover!==null&&hover!==i?0.5:0.9}
          transform={hover===i?`translate(${Math.cos(s.midA)*4},${Math.sin(s.midA)*4})`:""}
          style={{cursor:"pointer",transition:"all .2s"}}
          onMouseEnter={()=>setHover(i)}
          onMouseLeave={()=>setHover(null)}/>
      ))}
      <circle cx={cx} cy={cy} r={28} fill={white}/>
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={txt}>
        {hover!==null ? `${(segments[hover]?.pct*100).toFixed(0)}%` : `${data.length}`}
      </text>
      <text x={cx} y={cy+13} textAnchor="middle" fontSize={8} fill={muted}>
        {hover!==null ? (segments[hover]?.label||"").slice(0,10) : "produtos"}
      </text>
      <g transform="translate(155,10)">
        {segments.map((s,i)=>(
          <g key={i} transform={`translate(0,${i*20})`}
            onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
            style={{cursor:"pointer"}}>
            <rect width={10} height={10} rx={2} fill={s.color} y={1}/>
            <text x={14} y={10} fontSize={9} fill={muted}>
              {String(s.label).slice(0,12)} — {s.kg.toLocaleString("pt-BR",{minimumFractionDigits:0})} kg
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── Barra de progresso ────────────────────────────────────────────────────────
function Bar({ val, max, color }){
  const pct=Math.min(100,(val/max)*100);
  return(
    <div style={{flex:1,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:"width .4s"}}/>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV_GERENTE=[
  {id:"dashboard", icon:"ti-layout-dashboard", label:"Dashboard"},
  {id:"relatorios",icon:"ti-file-text",        label:"Relatórios"},
  {id:"historico", icon:"ti-clock",             label:"Histórico"},
  {id:"importacao",icon:"ti-upload",            label:"Importação"},
  {id:"config",    icon:"ti-settings",          label:"Configurações"},
  {id:"sair",      icon:"ti-logout",            label:"Sair"},
];

const NAV_OPERADOR=[
  {id:"dashboard", icon:"ti-layout-dashboard", label:"Dashboard"},
  {id:"importacao",icon:"ti-upload",           label:"Importação"},
  {id:"historico", icon:"ti-clock",            label:"Histórico"},
  {id:"relatorios",icon:"ti-file-text",        label:"Relatórios"},
  {id:"sair",      icon:"ti-logout",           label:"Sair"},
];

const NAV_ESTOQUE=[
  {id:"dashboard", icon:"ti-layout-dashboard", label:"Dashboard"},
  {id:"relatorios",icon:"ti-file-text",        label:"Relatórios"},
  {id:"historico", icon:"ti-clock",            label:"Histórico"},
  {id:"sair",      icon:"ti-logout",           label:"Sair"},
];

function Sidebar({ page, setPage, perfil }){
  const nav = perfil==="operador" ? NAV_OPERADOR
            : perfil==="estoque"  ? NAV_ESTOQUE
            : NAV_GERENTE;
  return(
    <div style={{width:200,minWidth:200,background:navy,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0}}>
      {/* Logo */}
      <div style={{padding:"20px 16px 16px",borderBottom:"1px solid #ffffff18"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:44,height:44,background:navy,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><img src="/logo-frigo.png" alt="logo" style={{width:44,height:44,objectFit:"cover"}}/></div>
          <div>
            <div style={{color:white,fontWeight:800,fontSize:18,letterSpacing:1,lineHeight:1}}>SIGE</div>
            <div style={{color:red,fontWeight:700,fontSize:10,letterSpacing:2}}>FRIGORÍFICO</div>
          </div>
        </div>
      </div>
      {/* Nav */}
      <nav style={{flex:1,padding:"12px 10px",display:"flex",flexDirection:"column",gap:2}}>
        {nav.map(n=>{
          const active=page===n.id;
          return(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{
              display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,
              border:"none",cursor:"pointer",width:"100%",textAlign:"left",
              background: active?"#1D6FD8":"transparent",
              color: active?white:"#A8B9CC",
              fontWeight: active?600:400,fontSize:13,transition:"all .15s",
            }}
            onMouseEnter={e=>{if(!active)e.currentTarget.style.background="#ffffff14"}}
            onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent"}}
            >
              <i className={`ti ${n.icon}`} style={{fontSize:18}} aria-hidden="true"/>
              {n.label}
            </button>
          );
        })}
      </nav>
      {/* Help */}
      <div style={{padding:"14px 14px",borderTop:"1px solid #ffffff18"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,background:"#ffffff18",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="ti ti-headset" style={{fontSize:16,color:red}} aria-hidden="true"/>
          </div>
          <div>
            <div style={{color:"#A8B9CC",fontSize:11}}>Precisa de ajuda?</div>
            <div style={{color:red,fontSize:11,fontWeight:600,cursor:"pointer"}}>Fale com o suporte</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ title, subtitle }){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 28px",borderBottom:`1px solid ${border}`,background:white}}>
      <div>
        <div style={{fontSize:20,fontWeight:700,color:txt}}>{title}</div>
        {subtitle&&<div style={{fontSize:12,color:muted,marginTop:1}}>{subtitle}</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:16}}>

        <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <div style={{width:32,height:32,background:navy,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:white,fontWeight:700,fontSize:12}}>AD</div>
          <span style={{fontSize:12,color:txt,fontWeight:500}}>
              Olá, {localStorage.getItem("nome") ?? "Usuário"}
            </span>
            <span style={{
              fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,
              background: localStorage.getItem("perfil")==="gerente" ? "#DCFCE7"
                        : localStorage.getItem("perfil")==="operador" ? "#EFF6FF"
                        : "#FEF3C7",
              color: localStorage.getItem("perfil")==="gerente" ? green
                  : localStorage.getItem("perfil")==="operador" ? blue
                  : orange,
            }}>
              {localStorage.getItem("perfil")?.toUpperCase() ?? ""}
            </span>
          <i className="ti ti-chevron-down" style={{fontSize:13,color:muted}} aria-hidden="true"/>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ bg, icon, label, value, sub, change, changePositive }){
  return(
    <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"18px 20px",display:"flex",gap:14,alignItems:"flex-start"}}>
      <div style={{width:52,height:52,background:bg,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>
        {icon}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:10,fontWeight:700,color:muted,textTransform:"uppercase",letterSpacing:.8}}>{label}</div>
        <div style={{fontSize:22,fontWeight:800,color:txt,margin:"3px 0"}}>{value}</div>
        <div style={{fontSize:11,color:muted}}>{sub}</div>
        {change&&<div style={{fontSize:11,color:changePositive?green:red,marginTop:3,fontWeight:600}}>
          {changePositive?"▲":"▼"} {change}
        </div>}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
function DashboardPage({ imported }){
  const [dados, setDados] = useState(null);
  const [estoque, setEstoque] = useState([]);
  const [filtroEstoque, setFiltroEstoque] = useState(null);
  const [verTodosMais, setVerTodosMais]   = useState(false);
  const [verTodosMenos, setVerTodosMenos] = useState(false);
  const [filtros, setFiltros] = useState({ periodo:"todos", produto:"todos", categoria:"todos", dataInicio:"", dataFim:"" });
  const [produtos, setProdutos]     = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [detalhesDias, setDetalhesDias] = useState({});

  useEffect(()=>{
    getFiltros().then(res=>{
      setProdutos(res.data.produtos);
      setCategorias(res.data.categorias);
    }).catch(()=>{});
  },[imported]);

  useEffect(()=>{
    getEstoque().then(res => setEstoque(res.data)).catch(()=>{});
  }, [imported]);

  useEffect(()=>{
    getDashboard(filtros)
      .then(res => {
        setDados(res.data);
        if(res.data?.por_periodo && res.data.por_periodo.length > 0){
          console.log("carregando detalhes...", res.data.por_periodo.length);
          res.data.por_periodo.forEach(async (p)=>{
            console.log("buscando dia:", p.data);
            try{
              const r = await getVendasDia(p.data);
              console.log("resultado dia:", p.data, r.data?.length);
              setDetalhesDias(prev=>({...prev, [p.data]: r.data}));
            }catch(e){
              console.log("erro dia:", e);
            }
          });
        }
      })
      .catch(()=>{});
  }, [filtros]);

  const totVendido  = dados?.total_vendido ?? 0;
  const mediaDiaria = dados?.media_diaria  ?? 0;
  const topItems    = dados?.mais_vendidos ?? [];
  const lowItems    = dados?.menos_vendidos?? [];
  const topProduto  = dados?.top_produto   ?? "—";
  const lowProduto  = dados?.low_produto   ?? "—";
  const chartData   = dados?.por_periodo?.length > 0
    ? [...dados.por_periodo].reverse().map(r => r.kg) : [];
  const chartDays   = dados?.por_periodo?.length > 0
    ? [...dados.por_periodo].reverse().map(r => {
        const [,mes,dia] = r.data.split("-");
        return `${dia}/${mes}`;
      }) : [];
  const chartDates  = dados?.por_periodo?.length > 0
    ? [...dados.por_periodo].reverse().map(r => r.data) : [];

  return(
    <div style={{flex:1,overflowY:"auto",background:offW}}>
      <Topbar
        title="Dashboard Gerencial"
        subtitle={dados?.data_inicio && dados?.data_fim
          ? `Vendas de ${new Date(dados.data_inicio+"T12:00:00").toLocaleDateString("pt-BR")} a ${new Date(dados.data_fim+"T12:00:00").toLocaleDateString("pt-BR")} — dados atualizados automaticamente após importação.`
          : "Vendas de carnes - Resultados da semana"}
      />
      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:20}}>

        {/* ── Filtros ── */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:10,padding:"14px 20px",display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:muted}}>De</label>
            <input type="date" value={filtros.dataInicio}
              onChange={e=>setFiltros(f=>({...f,dataInicio:e.target.value,periodo:"custom"}))}
              style={{padding:"8px 10px",borderRadius:7,border:`1px solid ${border}`,fontSize:12,color:txt,background:white}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:muted}}>Até</label>
            <input type="date" value={filtros.dataFim}
              onChange={e=>setFiltros(f=>({...f,dataFim:e.target.value,periodo:"custom"}))}
              style={{padding:"8px 10px",borderRadius:7,border:`1px solid ${border}`,fontSize:12,color:txt,background:white}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:180}}>
            <label style={{fontSize:11,fontWeight:600,color:muted}}>Tipo de Carne</label>
            <select value={filtros.produto}
              onChange={e=>setFiltros(f=>({...f,produto:e.target.value}))}
              style={{padding:"8px 10px",borderRadius:7,border:`1px solid ${border}`,fontSize:12,color:txt,background:white}}>
              <option value="todos">Todos</option>
              {produtos.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:180}}>
            <label style={{fontSize:11,fontWeight:600,color:muted}}>Categoria</label>
            <select value={filtros.categoria}
              onChange={e=>setFiltros(f=>({...f,categoria:e.target.value}))}
              style={{padding:"8px 10px",borderRadius:7,border:`1px solid ${border}`,fontSize:12,color:txt,background:white}}>
              <option value="todos">Todas</option>
              {categorias.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={()=>setFiltros({periodo:"todos",produto:"todos",categoria:"todos",dataInicio:"",dataFim:""})}
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",background:white,color:muted,border:`1px solid ${border}`,borderRadius:7,fontSize:12,cursor:"pointer"}}>
            <i className="ti ti-refresh" aria-hidden="true"/> Limpar
          </button>
          {imported&&<span style={{fontSize:11,color:green,fontWeight:600,marginLeft:"auto",alignSelf:"center"}}>✓ Dados da planilha importada</span>}
        </div>

        {/* ── KPIs ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
          <KpiCard bg={navy}   icon="🥩" label="Quantidade total vendida" value={fmtKg(totVendido)}  sub="Total de carnes vendidas no período"/>
          <KpiCard bg={navy}   icon="📉" label="Média diária vendida"     value={fmtKg(mediaDiaria)} sub="Média de vendas por dia no período"/>
          <KpiCard bg={green}  icon="🏆" label="Tipo que mais saiu"       value={topProduto}         sub={`${fmtKg(dados?.top_kg??0)} vendidos no período`}/>
          <KpiCard bg={red}    icon="📈" label="Tipo que menos saiu"      value={lowProduto}         sub={`${fmtKg(dados?.low_kg??0)} vendidos no período`}/>
        </div>

        {/* ── Gráfico de linha — largura total ── */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"18px 24px"}}>
          <div style={{fontSize:12,fontWeight:700,color:txt,textTransform:"uppercase",letterSpacing:.5,marginBottom:14}}>
            Vendas por período (kg)
          </div>
          {chartData.length > 0
            ? <LineChart data={chartData} days={chartDays} dates={chartDates} detalhesDias={detalhesDias}/>
            : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:muted,fontSize:12}}>Nenhum dado importado ainda.</div>
          }
        </div>

        {/* ── Mais Vendidos + Baixa Saída ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

          {/* Mais vendidos */}
          <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"20px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:txt,textTransform:"uppercase",letterSpacing:.5}}>🏆 Mais Vendidos</div>
                <div style={{fontSize:11,color:muted,marginTop:2}}>Produtos com maior saída no período</div>
              </div>
              <div style={{background:"#EFF6FF",color:blue,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20}}>
                Top {Math.min(5,topItems.length)}
              </div>
            </div>
            {topItems.length===0
              ? <div style={{color:muted,fontSize:12,textAlign:"center",padding:"40px 0"}}>Nenhum dado importado ainda.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {(verTodosMais?topItems:topItems.slice(0,5)).map((r,i)=>{
                    const pct = topItems[0]?.kg > 0 ? ((r.kg/topItems[0].kg)*100) : 0;
                    const medals = ["🥇","🥈","🥉"];
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,border:`1px solid ${border}`,background:offW}}>
                        <span style={{fontSize:14,flexShrink:0}}>{medals[i]??`${i+1}.`}</span>
                        <span style={{flex:1,fontSize:12,color:txt,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nome??r.produto}</span>
                        <div style={{width:80,height:5,background:"#DBEAFE",borderRadius:3,overflow:"hidden",flexShrink:0}}>
                          <div style={{width:`${pct}%`,height:"100%",background:blue,borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:blue,flexShrink:0,minWidth:70,textAlign:"right"}}>{(r.kg).toLocaleString("pt-BR",{minimumFractionDigits:2})} kg</span>
                      </div>
                    );
                  })}
                </div>
            }
            <div onClick={()=>setVerTodosMais(v=>!v)} style={{fontSize:11,color:blue,cursor:"pointer",marginTop:12,fontWeight:600}}>
              {verTodosMais ? "▲ Ver menos" : `▼ Ver todos (${topItems.length})`}
            </div>
          </div>

          {/* Baixa Saída */}
          <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"20px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:txt,textTransform:"uppercase",letterSpacing:.5}}>⚠️ Baixa Saída — Ação Necessária</div>
                <div style={{fontSize:11,color:muted,marginTop:2}}>Produtos abaixo da média — requer decisão gerencial</div>
              </div>
              <div style={{background:"#FEF2F2",color:red,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20}}>
                {lowItems.length} produtos
              </div>
            </div>
            {lowItems.length===0
              ? <div style={{color:muted,fontSize:12,textAlign:"center",padding:"40px 0"}}>Nenhum dado importado ainda.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {(verTodosMenos?lowItems:lowItems.slice(0,5)).map((r,i)=>{
                    const maxLow = lowItems[lowItems.length-1]?.kg||1;
                    const pct = (r.kg/maxLow)*100;
                    const total = topItems.reduce((a,b)=>a+b.kg,0)||1;
                    const share = ((r.kg/total)*100).toFixed(1);
                    const estoqueItem = estoque.find(e=>e.nome===(r.nome??r.produto));
                    const diasEstoque = estoqueItem?.dias_estoque??0;
                    const cobertura   = estoqueItem?.cobertura??0;
                    const acao = diasEstoque>=30 && cobertura>=5
                      ? {texto:"Promoção Urgente", color:red,      bg:"#FEE2E2", icon:"🚨", desc:"Produto parado há muito tempo com estoque elevado — fazer promoção urgente"}
                      : diasEstoque>=20 && cobertura>=3
                      ? {texto:"Fazer Promoção",   color:orange,   bg:"#FEF3C7", icon:"📢", desc:"Estoque parado há bastante tempo — girar com promoção ou combo"}
                      : cobertura<1 && diasEstoque>=20
                      ? {texto:"Promoção Urgente", color:red,      bg:"#FEE2E2", icon:"🚨", desc:"Produto parado com estoque acabando — fazer promoção urgente para girar antes de vencer"}
                      : cobertura<1
                      ? {texto:"Fazer Promoção",   color:orange,   bg:"#FEF3C7", icon:"📢", desc:"Estoque baixo com pouca saída — aplicar promoção ou desconto para girar"}
                      : cobertura<3 && diasEstoque>=15
                      ? {texto:"Atenção",          color:"#7C3AED",bg:"#EDE9FE", icon:"⚠️", desc:"Produto parado com estoque baixo — verificar qualidade e decidir entre repor ou descontinuar"}
                      : cobertura>=5 && diasEstoque<15
                      ? {texto:"Criar Combo",      color:"#7C3AED",bg:"#EDE9FE", icon:"🎁", desc:"Estoque recente com boa cobertura — criar combo para aumentar saída"}
                      : cobertura>=3 && diasEstoque<15
                      ? {texto:"Investigar Saída", color:"#0891B2",bg:"#ECFEFF", icon:"🔍", desc:"Estoque saudável mas vendas abaixo da média — investigar motivo da baixa saída"}
                      : cobertura>=2
                      ? {texto:"Desconto",         color:blue,     bg:"#EFF6FF", icon:"🏷️", desc:"Cobertura baixa — aplicar desconto para girar o estoque rapidamente"}
                      : {texto:"Monitorar",        color:green,    bg:"#DCFCE7", icon:"👁️", desc:"Situação estável — acompanhar a evolução das vendas"};
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,border:`1px solid ${border}`,background:offW}}>
                        <div style={{
                          width:20,height:20,borderRadius:"50%",flexShrink:0,
                          background:i===0?"#FEE2E2":i===1?"#FEF3C7":"#F3F4F6",
                          color:i===0?red:i===1?orange:"#6B7280",
                          fontSize:10,fontWeight:700,
                          display:"flex",alignItems:"center",justifyContent:"center"
                        }}>{i+1}</div>
                        <span style={{flex:1,fontSize:12,color:txt,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nome??r.produto}</span>
                        <div style={{width:80,height:5,background:"#FEE2E2",borderRadius:3,overflow:"hidden",flexShrink:0}}>
                          <div style={{width:`${pct}%`,height:"100%",background:red,borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:red,flexShrink:0,minWidth:70,textAlign:"right"}}>{(r.kg).toLocaleString("pt-BR",{minimumFractionDigits:2})} kg</span>
                        <span title={acao.desc} style={{
                          fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                          background:acao.bg,color:acao.color,flexShrink:0,
                          border:`1px solid ${acao.color}22`,whiteSpace:"nowrap",cursor:"help"
                        }}>
                          {acao.icon} {acao.texto}
                        </span>

                      </div>
                    );
                  })}
                </div>
            }
            <div onClick={()=>setVerTodosMenos(v=>!v)} style={{fontSize:11,color:red,cursor:"pointer",marginTop:12,fontWeight:600}}>
              {verTodosMenos ? "▲ Ver menos" : `▼ Ver todos (${lowItems.length})`}
            </div>
          </div>
        </div>

        {/* ── Cards resumo de estoque ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
          {[
            {label:"Total em Estoque", value:`${estoque.reduce((a,r)=>a+(r.estoque??0),0).toLocaleString("pt-BR",{minimumFractionDigits:2})} kg`, icon:"📦", color:navy,   bg:white,      filtro:null,       sub:`${estoque.length} produtos cadastrados`},
            {label:"Ruptura / Baixo",  value:`${estoque.filter(r=>["Ruptura","Baixo"].includes(r.status??r.situacao)).length} produtos`,          icon:"🚨", color:red,    bg:"#FEF2F2",  filtro:"Baixo",    sub:"Estoque crítico — ação imediata"},
            {label:"Comprar",          value:`${estoque.filter(r=>r.indice_risco==="Comprar").length} produtos`,                                    icon:"🛒", color:blue,   bg:"#EFF6FF",  filtro:"Comprar",  sub:"Repor estoque em breve"},
            {label:"Promoção",         value:`${estoque.filter(r=>["Promoção","Promoção Urgente"].includes(r.indice_risco)).length} produtos`,      icon:"📢", color:orange, bg:"#FEF3C7",  filtro:"Promoção", sub:"Girar estoque parado"},
          ].map(c=>(
            <div key={c.label}
              onClick={()=>setFiltroEstoque(filtroEstoque===c.filtro?null:c.filtro)}
              style={{
                background:c.bg, border:`2px solid ${filtroEstoque===c.filtro?c.color:border}`,
                borderRadius:12, padding:"18px 20px", cursor:c.filtro?"pointer":"default",
                transition:"all .2s",
                boxShadow:filtroEstoque===c.filtro?`0 0 0 3px ${c.color}22`:"none",
              }}
              onMouseEnter={e=>{ if(c.filtro) e.currentTarget.style.borderColor=c.color; }}
              onMouseLeave={e=>{ if(filtroEstoque!==c.filtro) e.currentTarget.style.borderColor=border; }}
            >
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <span style={{fontSize:10,fontWeight:700,color:c.color,textTransform:"uppercase",letterSpacing:.8}}>{c.label}</span>
                <span style={{fontSize:20}}>{c.icon}</span>
              </div>
              <div style={{fontSize:22,fontWeight:800,color:c.color,marginBottom:4}}>{c.value}</div>
              <div style={{fontSize:11,color:muted}}>{c.sub}</div>
              {c.filtro&&(
                <div style={{fontSize:10,color:c.color,marginTop:8,fontWeight:600}}>
                  {filtroEstoque===c.filtro?"✓ Filtrando — clique para limpar":"Clique para filtrar"}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Análise Completa de Risco ── */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{position:"relative",display:"inline-block"}}>
                <div style={{fontSize:12,fontWeight:700,color:txt,textTransform:"uppercase",letterSpacing:.5,display:"flex",alignItems:"center",gap:6}}>
                  🎯 Análise Completa de Risco de Estoque
                  <span style={{width:16,height:16,borderRadius:"50%",background:blue,color:white,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"help"}}
                    onMouseEnter={e=>e.currentTarget.nextSibling.style.display="block"}
                    onMouseLeave={e=>e.currentTarget.nextSibling.style.display="none"}
                  >?</span>
                  <div style={{display:"none",position:"absolute",top:24,left:0,zIndex:100,background:navy,borderRadius:12,padding:"16px 20px",width:380,boxShadow:"0 8px 32px #0004"}}>
                    <div style={{fontSize:12,fontWeight:700,color:white,marginBottom:12}}>📋 Regras do Índice de Risco</div>
                    {[
                      {icon:"✕",  color:"#F87171", label:"Ruptura",          desc:"Cobertura = 0 dias — sem estoque"},
                      {icon:"🛒", color:"#60A5FA", label:"Comprar urgente",  desc:"Cobertura < 1 dia"},
                      {icon:"🛒", color:"#60A5FA", label:"Comprar em breve", desc:"Cobertura 1-3 dias, produto recente (< 15 dias)"},
                      {icon:"⚠️", color:"#C084FC", label:"Atenção",          desc:"Cobertura 1-3 dias + produto parado (≥ 15 dias)"},
                      {icon:"🚨", color:"#F87171", label:"Promoção Urgente", desc:"Cobertura ≥ 3 dias + parado há ≥ 30 dias"},
                      {icon:"📢", color:"#FB923C", label:"Promoção",         desc:"Cobertura ≥ 3 dias + parado há ≥ 20 dias"},
                      {icon:"⚠️", color:"#C084FC", label:"Monitorar",        desc:"Cobertura ≥ 3 dias + parado há ≥ 15 dias"},
                      {icon:"✅", color:"#4ADE80", label:"Normal",            desc:"Cobertura ≥ 3 dias + produto recente (< 15 dias)"},
                    ].map((row,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                        <span style={{fontSize:12,minWidth:20}}>{row.icon}</span>
                        <div>
                          <span style={{fontSize:11,fontWeight:700,color:row.color}}>{row.label}</span>
                          <span style={{fontSize:11,color:"#A8B9CC",marginLeft:6}}>— {row.desc}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #ffffff18",fontSize:10,color:"#64748B"}}>
                      💡 Índice calculado automaticamente ao importar a planilha
                    </div>
                  </div>
                </div>
                <div style={{fontSize:11,color:muted,marginTop:2}}>Análise de envelhecimento e ação recomendada</div>
              </div>
              <span style={{fontSize:11,color:muted}}>{estoque.length} produtos</span>
            </div>

          {/* Busca e filtros */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <input value={filtroEstoque||""} onChange={e=>setFiltroEstoque(e.target.value||null)}
              placeholder="🔍 Buscar produto..."
              style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${border}`,fontSize:12,color:txt,width:200,flexShrink:0}}/>

            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {[
                {label:"Todos",            filtro:null,           color:muted,     bg:offW},
                {label:"🚨 Ruptura/Baixo", filtro:"Ruptura/Baixo",color:red,       bg:"#FEE2E2"},
                {label:"🛒 Comprar",       filtro:"Comprar",      color:blue,      bg:"#EFF6FF"},
                {label:"📢 Promoção",      filtro:"Promoção",     color:orange,    bg:"#FEF3C7"},
                {label:"⚠️ Atenção",       filtro:"Atenção",      color:"#7C3AED", bg:"#EDE9FE"},
                {label:"✅ Normal",         filtro:"Normal",       color:green,     bg:"#DCFCE7"},
              ].map(f=>(
                <button key={f.label} onClick={()=>setFiltroEstoque(filtroEstoque===f.filtro?null:f.filtro)} style={{
                  padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                  background:filtroEstoque===f.filtro?(f.color===muted?navy:f.color):f.bg,
                  color:filtroEstoque===f.filtro?white:f.color,
                  transition:"all .2s"
                }}>{f.label}</button>
              ))}
            </div>

            </div>
          </div>

          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:offW}}>
                {["Produto","Qtd em Estoque","Data Entrada","Dias em Estoque","Cobertura","Índice de Risco","Ação Recomendada"].map(h=>(
                  <th key={h} style={{padding:"8px 14px",textAlign:"left",color:muted,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:.5,borderBottom:`1px solid ${border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(()=>{
                const lista = estoque.filter(r=>{
                  const ir = r.indice_risco??"Normal";
                  const s  = r.status??r.situacao;
                  const matchBusca  = !filtroEstoque || r.nome.toLowerCase().includes(filtroEstoque.toLowerCase());
                  const matchFiltro = !filtroEstoque
                    || (filtroEstoque==="Ruptura/Baixo" && ["Ruptura","Baixo"].includes(s))
                    || (filtroEstoque==="Comprar"  && ir==="Comprar")
                    || (filtroEstoque==="Promoção" && ["Promoção","Promoção Urgente"].includes(ir))
                    || (filtroEstoque==="Atenção"  && ir==="Atenção")
                    || (filtroEstoque==="Normal"   && ir==="Normal")
                    || matchBusca;
                  return matchFiltro;
                });

                if(lista.length===0) return(
                  <tr><td colSpan={7} style={{padding:"40px",textAlign:"center",color:muted}}>Nenhum produto encontrado.</td></tr>
                );

                return lista.map((r,i)=>{
                  const s  = r.status??r.situacao;
                  const ir = r.indice_risco??"Normal";
                  const riscoColor = ir==="Promoção Urgente"?red:ir==="Promoção"?orange:ir==="Atenção"?"#7C3AED":ir==="Comprar"?blue:ir==="Ruptura"?red:green;
                  const riscoBg    = ir==="Promoção Urgente"?"#FEE2E2":ir==="Promoção"?"#FEF3C7":ir==="Atenção"?"#EDE9FE":ir==="Comprar"?"#EFF6FF":ir==="Ruptura"?"#FEE2E2":"#DCFCE7";
                  const riscoIcon  = ir==="Promoção Urgente"?"🚨":ir==="Promoção"?"📢":ir==="Atenção"?"⚠️":ir==="Comprar"?"🛒":ir==="Ruptura"?"✕":"✅";
                  return(
                    <tr key={i} style={{borderBottom:`1px solid ${border}22`}}
                      onMouseEnter={e=>e.currentTarget.style.background=offW}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"10px 14px",color:txt,fontWeight:500}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}><span>🥩</span>{r.nome}</div>
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{color:txt,fontWeight:600}}>{(r.estoque??0).toLocaleString("pt-BR",{minimumFractionDigits:2})} kg</span>
                          <div style={{width:60,height:4,background:"#E2E8F0",borderRadius:2}}>
                            <div style={{width:`${Math.min(100,((r.estoque??0)/Math.max(...estoque.map(e=>e.estoque??0),1))*100)}%`,height:"100%",background:statusColor(s),borderRadius:2}}/>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"10px 14px",color:muted,fontSize:11}}>
                        {r.data_entrada ? new Date(r.data_entrada+"T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:13,fontWeight:700,color:(r.dias_estoque||0)>=30?red:(r.dias_estoque||0)>=15?orange:green}}>{r.dias_estoque||0}</span>
                        <span style={{fontSize:11,color:muted,marginLeft:4}}>dias</span>
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:13,fontWeight:700,color:statusColor(s)}}>{r.cobertura??0}</span>
                        <span style={{fontSize:11,color:muted,marginLeft:4}}>dias</span>
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{background:riscoBg,color:riscoColor,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,border:`1px solid ${riscoColor}33`,whiteSpace:"nowrap"}}>
                          {riscoIcon} {ir}
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",color:muted,fontSize:11}}>
                        {r.acao_recomendada??"Monitorar"}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}


// ── Importação Page ────────────────────────────────────────────────────────────
function ImportacaoPage({ onImport }){
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [step, setStep] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const inputRef = useRef();
  const [ultimaImport, setUltimaImport] = useState(null);

  useEffect(()=>{
    getHistorico().then(res=>{
      console.log("historico:", res.data);
      if(res.data?.length > 0){
        const ultima = res.data.find(r=>r.status==="sucesso");
        console.log("ultima:", ultima);
        if(ultima){
        const dataUTC = new Date(ultima.data);
        const dataBR = new Date(dataUTC.getTime() - 3 * 60 * 60 * 1000);
        setUltimaImport(dataBR.toLocaleString("pt-BR"));
        }
      }
    }).catch(e=>console.log("erro:",e));
  },[status]);
  const [tempoInicio] = useState(new Date());

  const STEPS = [
    {label:"Arquivo Enviado",     icon:"ti-file-upload",  time: new Date(tempoInicio.getTime()+0*60000).toLocaleString("pt-BR")},
    {label:"Validação",           icon:"ti-shield-check", time: new Date(tempoInicio.getTime()+1*60000).toLocaleString("pt-BR")},
    {label:"Processamento",       icon:"ti-database",     time: new Date(tempoInicio.getTime()+2*60000).toLocaleString("pt-BR")},
    {label:"Dashboard Atualizado",icon:"ti-chart-bar",    time: new Date(tempoInicio.getTime()+3*60000).toLocaleString("pt-BR")},
  ];

  const processFile = useCallback(async (f)=>{
    if(!f) return;
    if(!f.name.match(/\.(xlsx|xls|csv)$/i)){
      setErrMsg("Formato inválido. Use .xlsx, .xls ou .csv"); setStatus("error"); return;
    }
    setFile(f); setStatus("loading"); setStep(0); setErrMsg("");

    try{
      // Passo 1 — arquivo recebido
      setStep(1);

      // Passo 2 — envia para o backend
      const form = new FormData();
      form.append("arquivo", f);
      setStep(2);

      const res = await uploadPlanilha(f);
      setStep(3);

      // Passo 3 — lê localmente para passar ao dashboard
      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          const wb = XLSX.read(e.target.result,{type:"array"});
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null});
          setStep(4);
          setStatus("success");
          localStorage.setItem("ultima_importacao", new Date().toLocaleString("pt-BR"));
          onImport(rows);
        }catch(err){
          setStatus("error");
          setErrMsg("Erro ao ler o arquivo: "+err.message);
        }
      };
      reader.readAsArrayBuffer(f);

    }catch(err){
      setStatus("error");
      setErrMsg(err?.response?.data?.detail ?? "Erro ao enviar o arquivo.");
    }
  },[onImport]);

  const onDrop = useCallback((e)=>{e.preventDefault();setDrag(false);processFile(e.dataTransfer.files[0]);},[processFile]);

  return(
    <div style={{flex:1,overflowY:"auto",background:offW}}>
      <Topbar title="Importação de Planilha"/>
      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,maxWidth:900}}>

        {/* Header card */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:txt}}>Importação de Planilha</div>
            <div style={{fontSize:12,color:muted,marginTop:4,lineHeight:1.6}}>
              Envie sua planilha de vendas e estoque para atualizar os dashboards<br/>e manter as informações sempre atualizadas.
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:44,height:44,background:navy,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <i className="ti ti-calendar" style={{fontSize:20,color:white}} aria-hidden="true"/>
            </div>
            <div>
              <div style={{fontSize:11,color:muted}}>Última atualização do dashboard</div>
              <div style={{fontSize:14,fontWeight:700,color:txt}}>
                {status==="success"
                  ? new Date().toLocaleString("pt-BR")
                  : ultimaImport ?? "Nenhuma importação realizada"}
              </div>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={onDrop}
          onClick={()=>status!=="loading"&&inputRef.current.click()}
          style={{
            border:`2px dashed ${drag?"#1D6FD8":border}`,
            borderRadius:12,padding:"50px 20px",textAlign:"center",
            background:drag?"#EFF6FF":white,cursor:"pointer",transition:"all .2s",
          }}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
            onChange={e=>processFile(e.target.files[0])}/>
          <i className="ti ti-cloud-upload" style={{fontSize:48,color:blue,display:"block",marginBottom:16}} aria-hidden="true"/>
          <div style={{fontSize:20,fontWeight:700,color:txt,marginBottom:6}}>
            {status==="loading"?"Processando arquivo..." : file ? file.name : "Envie sua planilha para atualizar o dashboard"}
          </div>
          <div style={{fontSize:12,color:muted,marginBottom:6}}>Arquivos aceitos: .xlsx, .xls, .csv</div>
          <div style={{fontSize:12,color:muted,marginBottom:20}}>Tamanho máximo: 10MB</div>
          {status!=="loading"&&(
            <button style={{
              display:"inline-flex",alignItems:"center",gap:8,
              padding:"11px 28px",background:red,color:white,
              border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",
            }}>
              <i className="ti ti-upload" aria-hidden="true"/> Enviar Planilha
            </button>
          )}
          {status==="loading"&&(
            <div style={{display:"inline-flex",alignItems:"center",gap:8,color:blue,fontWeight:600,fontSize:13}}>
              <div style={{width:16,height:16,border:`2px solid ${blue}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              Aguarde...
            </div>
          )}
          {status==="error"&&<div style={{marginTop:12,color:red,fontSize:12,fontWeight:600}}>{errMsg}</div>}

          {/* Botão baixar modelo*/}
          <div style={{textAlign:"center",marginTop:25}}>
            
              <a href="/planilha-modelo-sige-centercarnes.xlsx"
              download="planilha-modelo-sige-centercarnes.xlsx"
              onClick={e=>e.stopPropagation()}
              style={{fontSize:12,color:blue,cursor:"pointer",textDecoration:"none",
                display:"inline-flex",alignItems:"center",gap:4,fontWeight:650}}>
              <i className="ti ti-download" style={{fontSize:14}} aria-hidden="true"/>Baixar modelo da planilha</a>
          </div>
        </div>

        {/* Status steps */}
        {(status==="loading"||status==="success")&&(
          <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"24px"}}>
            <div style={{fontSize:13,fontWeight:700,color:txt,marginBottom:20}}>Status da Última Importação</div>
            <div style={{display:"flex",alignItems:"center",gap:0}}>
              {STEPS.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",flex:1}}>
                  <div style={{textAlign:"center",flex:"0 0 auto"}}>
                    <div style={{
                      width:54,height:54,borderRadius:"50%",
                      background: i<step ? navy : i===step&&status==="loading" ? blue : "#E2E8F0",
                      display:"flex",alignItems:"center",justifyContent:"center",position:"relative",margin:"0 auto 6px"
                    }}>
                      <i className={`ti ${s.icon}`} style={{fontSize:22,color: i<=step?"white":muted}} aria-hidden="true"/>
                      {i<step&&<div style={{
                        position:"absolute",bottom:-2,right:-2,
                        width:18,height:18,background:green,borderRadius:"50%",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        color:white,fontSize:10,fontWeight:700,border:`2px solid ${white}`
                      }}>✓</div>}
                    </div>
                    <div style={{fontSize:11,fontWeight:600,color:i<=step?txt:muted}}>{s.label}</div>
                    <div style={{fontSize:10,color:muted}}>{i<step?s.time:""}</div>
                  </div>
                  {i<STEPS.length-1&&(
                    <div style={{flex:1,height:2,background:i<step?green:"#E2E8F0",margin:"0 6px",marginBottom:28,transition:"background .3s"}}/>
                  )}
                </div>
              ))}
              {/* Resultado final */}
              <div style={{display:"flex",alignItems:"center"}}>
                <div style={{width:2,height:2,background:step>=4?green:"#E2E8F0",flex:1,margin:"0 6px",marginBottom:28}}/>
                <div style={{
                  width:130,minHeight:80,borderRadius:10,
                  background:status==="success"?"#DCFCE7":"#F3F4F6",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  padding:"12px 8px",gap:6
                }}>
                  {status==="success"?(
                    <>
                      <div style={{width:36,height:36,background:green,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:white,fontSize:18,fontWeight:700}}>✓</div>
                      <div style={{fontSize:12,fontWeight:700,color:green,textAlign:"center"}}>Importação concluída com sucesso!</div>
                    </>
                  ):(
                    <div style={{width:36,height:36,border:`3px solid ${blue}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Importante */}
        <div style={{background:"#EFF6FF",border:`1px solid #BFDBFE`,borderRadius:12,padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <i className="ti ti-info-circle" style={{fontSize:18,color:blue}} aria-hidden="true"/>
            <span style={{fontSize:13,fontWeight:700,color:blue}}>Importante</span>
          </div>
          <ul style={{margin:0,padding:"0 0 0 20px",fontSize:12,color:txt,lineHeight:2}}>
            <li>Verifique se os dados estão corretos antes de enviar.</li>
            <li>Não altere a estrutura das colunas do modelo.</li>
            <li>Em caso de erro na importação, o dashboard não será atualizado.</li>
          </ul>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Login Page ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }){
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(false);

const handle = async ()=>{
    if(!email||!senha){ setErro(true); return; }
    setLoading(true); setErro(false);
    try{
      const res = await login(email, senha);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("nome", res.data.nome);
      localStorage.setItem("perfil", res.data.perfil);
      onLogin(res.data.perfil);
    }catch(err){
      setErro(true);
    }finally{
      setLoading(false);
    }
  };

  return(
    <div style={{display:"flex",height:"100vh",fontFamily:"'Segoe UI',sans-serif"}}>
      {/* Painel esquerdo */}
      <div style={{
        width:"38%",background:navy,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"space-between",padding:"40px 32px",
        backgroundImage:"linear-gradient(180deg,#0D1B2Aee 0%,#0D1B2Acc 100%)",
        position:"relative",overflow:"hidden"
      }}>
        {/* bg texture overlay */}
        <div style={{position:"absolute",inset:0,background:"url('https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&q=60') center/cover no-repeat",opacity:.18,zIndex:0}}/>
        <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
          {/* Logo */}
          <div style={{width:90,height:90,background:"#ffffff12",borderRadius:"50%",border:"2px solid #ffffff22",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,overflow:"hidden"}}><img src="/logo-frigo.png" alt="logo" style={{width:90,height:90,objectFit:"cover"}}/></div>
          <div style={{color:white,fontWeight:900,fontSize:48,letterSpacing:2,lineHeight:1}}>SIGE</div>
          <div style={{color:red,fontWeight:800,fontSize:14,letterSpacing:4,marginBottom:16}}>FRIGORÍFICO</div>
          <div style={{width:48,height:2,background:red,borderRadius:2,marginBottom:16}}/>
          <div style={{color:"#A8B9CC",fontSize:12,textAlign:"center",lineHeight:1.7}}>
            Sistema de Informação Gerencial<br/>Vendas e Estoque
          </div>
        </div>
        <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:10,color:"#A8B9CC",fontSize:12}}>
          <i className="ti ti-chart-line" style={{fontSize:16,color:red}} aria-hidden="true"/>
          Dashboards inteligentes para melhores decisões
        </div>
      </div>

      {/* Painel direito */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",background:white}}>
        <div style={{width:"100%",maxWidth:420}}>
          <h1 style={{fontSize:26,fontWeight:800,color:txt,textAlign:"center",margin:"0 0 6px"}}>Acesse sua conta</h1>
          <p style={{color:muted,textAlign:"center",fontSize:13,marginBottom:32}}>Informe seu e-mail e senha para entrar no sistema.</p>

          <div style={{background:white,border:`1px solid ${border}`,borderRadius:14,padding:"28px 28px",boxShadow:"0 4px 20px #0001"}}>
            {/* Email */}
            <label style={{fontSize:13,fontWeight:600,color:txt,display:"block",marginBottom:6}}>E-mail</label>
            <div style={{display:"flex",alignItems:"center",gap:10,border:`1px solid ${border}`,borderRadius:8,padding:"10px 14px",marginBottom:18,background:offW}}>
              <i className="ti ti-user" style={{fontSize:16,color:muted}} aria-hidden="true"/>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"
                style={{border:"none",background:"transparent",fontSize:13,color:txt,flex:1,outline:"none"}}/>
            </div>

            {/* Senha */}
            <label style={{fontSize:13,fontWeight:600,color:txt,display:"block",marginBottom:6}}>Senha</label>
            <div style={{display:"flex",alignItems:"center",gap:10,border:`1px solid ${border}`,borderRadius:8,padding:"10px 14px",marginBottom:14,background:offW}}>
              <i className="ti ti-lock" style={{fontSize:16,color:muted}} aria-hidden="true"/>
              <input value={senha} onChange={e=>setSenha(e.target.value)} type={showSenha?"text":"password"} placeholder="Digite sua senha"
                style={{border:"none",background:"transparent",fontSize:13,color:txt,flex:1,outline:"none"}}/>
              <i className={`ti ${showSenha?"ti-eye-off":"ti-eye"}`} onClick={()=>setShowSenha(v=>!v)}
                style={{fontSize:16,color:muted,cursor:"pointer"}} aria-hidden="true"/>
            </div>

            {/* Lembrar + esqueci */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:muted,cursor:"pointer"}}>
                <input type="checkbox" checked={lembrar} onChange={e=>setLembrar(e.target.checked)} style={{accentColor:red}}/>
                Lembrar-me
              </label>
              <span style={{fontSize:12,color:red,cursor:"pointer",fontWeight:600}}>Esqueceu sua senha?</span>
            </div>

            {/* Botão */}
            <button onClick={handle} style={{
              width:"100%",padding:"13px",background: loading?"#E5343E":red,
              color:white,border:"none",borderRadius:8,fontWeight:700,fontSize:14,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              transition:"background .2s"
            }}>
              {loading
                ? <><div style={{width:16,height:16,border:"2px solid white",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/> Entrando...</>
                : <><i className="ti ti-login" aria-hidden="true"/> Entrar</>
              }
            </button>
          </div>

          {/* Erro */}
          {erro&&(
            <div style={{marginTop:16,background:"#FEE2E2",border:`1px solid #FECACA`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{width:20,height:20,background:red,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:white,fontSize:12,fontWeight:700}}>✕</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:red}}>E-mail ou senha inválidos.</div>
                <div style={{fontSize:11,color:"#B91C1C"}}>Verifique suas informações e tente novamente.</div>
              </div>
            </div>
          )}

          <div style={{textAlign:"center",color:muted,fontSize:11,marginTop:24}}>© 2026 SIGE Frigorífico. Todos os direitos reservados.</div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
/* tela de histórico */
function HistoricoPage({ perfil }){
  const [lista, setLista] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(()=>{
    getHistorico().then(res => setLista(res.data)).catch(()=>{});
  },[]);

  const handleDelete = async (id) => {
    try {
      await deletarImportacao(id);
      setLista(h => h.filter(r => r.id !== id));
      setConfirmDelete(null);
    } catch(e) {
      alert("Erro ao excluir importação");
    }
  };

  return(
    <div style={{flex:1, overflowY:"auto", background:offW}}>
      <Topbar title="Histórico de Importações"/>
      <div style={{padding:"24px 28px"}}>
        <div style={{background:white, border:`1px solid ${border}`, borderRadius:12, overflow:"hidden"}}>
          <div style={{padding:"16px 24px", borderBottom:`1px solid ${border}`, fontSize:13, fontWeight:700, color:txt}}>
            Últimas importações realizadas
          </div>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:offW}}>
                {["#","Arquivo","Status","Registros","Data","Detalhes",""].map(h=>(
                  <th key={h} style={{padding:"10px 16px", textAlign:"left", color:muted,
                    fontWeight:600, fontSize:11, textTransform:"uppercase",
                    borderBottom:`1px solid ${border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr>
                  <td colSpan={7} style={{padding:"40px", textAlign:"center", color:muted}}>
                    Nenhuma importação realizada ainda.
                  </td>
                </tr>
              )}
              {lista.map((r,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${border}22`}}>
                  <td style={{padding:"12px 16px", color:muted}}>{r.id}</td>
                  <td style={{padding:"12px 16px", color:txt, fontWeight:500}}>{r.arquivo}</td>
                  <td style={{padding:"12px 16px"}}>
                    <span style={{
                      padding:"3px 10px", borderRadius:5, fontSize:11, fontWeight:700,
                      background: r.status==="sucesso" ? "#DCFCE7" : "#FEE2E2",
                      color: r.status==="sucesso" ? green : red
                    }}>
                      {r.status==="sucesso" ? "✓ Sucesso" : "✕ Erro"}
                    </span>
                  </td>
                  <td style={{padding:"12px 16px", color:muted, fontSize:11}}>
                    {r.status==="sucesso"
                      ? `${r.total_vendas ?? 0} vendas • ${r.total_estoque ?? 0} estoques`
                      : "—"}
                  </td>
                  <td style={{padding:"12px 16px", color:muted}}>
                    {new Date(r.data).toLocaleString("pt-BR")}
                  </td>
                  <td style={{padding:"12px 16px", color: r.status==="sucesso" ? txt : red, fontSize:11}}>
                    {r.detalhes ?? r.erro ?? "—"}
                  </td>
                  <td style={{padding:"12px 16px"}}>
                    {perfil==="gerente" && r.status==="sucesso" && (
                      confirmDelete===r.id
                        ? <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>handleDelete(r.id)} style={{
                              padding:"4px 10px",borderRadius:6,border:"none",
                              background:red,color:white,fontSize:11,cursor:"pointer",fontWeight:600
                            }}>Confirmar</button>
                            <button onClick={()=>setConfirmDelete(null)} style={{
                              padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,
                              background:white,color:muted,fontSize:11,cursor:"pointer"
                            }}>Cancelar</button>
                          </div>
                        : <button onClick={()=>setConfirmDelete(r.id)} style={{
                            padding:"4px 10px",borderRadius:6,border:`1px solid #FECACA`,
                            background:"#FEF2F2",color:red,fontSize:11,cursor:"pointer",fontWeight:600
                          }}>Excluir</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RelatoriosPage(){
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [estoqueRelatorio, setEstoqueRelatorio] = useState([]);

  useEffect(()=>{
    getDashboard().then(res => setDados(res.data)).catch(()=>{});
    getEstoque().then(res => setEstoqueRelatorio(res.data)).catch(()=>{});
  },[]);

  const exportarPDF = async ()=>{
    setLoading(true);
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();

    doc.setFillColor(13, 27, 42);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(18);
    doc.setFont("helvetica","bold");
    doc.text("SIGE FRIGORÍFICO", 14, 14);
    doc.setFontSize(10);
    doc.setFont("helvetica","normal");
    doc.text("Relatório Gerencial de Vendas e Estoque", 14, 22);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 120, 22);

    doc.setTextColor(0,0,0);
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text("Indicadores Gerais de Vendas", 14, 42);
    doc.setFontSize(10);
    doc.setFont("helvetica","normal");
    doc.text(`Total Vendido: ${fmtKg(dados?.total_vendido ?? 0)}`, 14, 52);
    doc.text(`Média Diária: ${fmtKg(dados?.media_diaria ?? 0)}`, 14, 60);
    doc.text(`Produto Mais Vendido: ${dados?.top_produto ?? "—"} (${fmtKg(dados?.top_kg ?? 0)})`, 14, 68);
    doc.text(`Produto Menos Vendido: ${dados?.low_produto ?? "—"} (${fmtKg(dados?.low_kg ?? 0)})`, 14, 76);

    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text("Produtos Mais Vendidos", 14, 92);
    autoTable(doc, {
      startY: 96,
      head: [["Produto", "Quantidade (kg)"]],
      body: (dados?.mais_vendidos ?? []).map(r=>[r.produto??r.nome, (r.kg).toLocaleString("pt-BR",{minimumFractionDigits:2})]),
      headStyles:{ fillColor:[13,27,42], textColor:255 },
      alternateRowStyles:{ fillColor:[245,246,250] },
    });

    const y2 = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text("Produtos Menos Vendidos", 14, y2);
    autoTable(doc, {
      startY: y2 + 4,
      head: [["Produto", "Quantidade (kg)"]],
      body: (dados?.menos_vendidos ?? []).map(r=>[r.produto??r.nome, (r.kg).toLocaleString("pt-BR",{minimumFractionDigits:2})]),
      headStyles:{ fillColor:[192,32,42], textColor:255 },
      alternateRowStyles:{ fillColor:[245,246,250] },
    });

    const y3 = doc.lastAutoTable.finalY + 16;
    if(y3 > 240) doc.addPage();
    let yEstoque = y3 > 240 ? 20 : y3;

    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.setTextColor(0,0,0);
    doc.text("Situação do Estoque", 14, yEstoque);
    doc.setFontSize(10);
    doc.setFont("helvetica","normal");

    const totalKgRelatorio = estoqueRelatorio.reduce((a,r)=>a+(r.estoque??0),0);
    doc.text(`Total em estoque: ${totalKgRelatorio.toLocaleString("pt-BR",{minimumFractionDigits:2})} kg`, 14, yEstoque+10);

    // Resumo por índice de risco
    const nUrgente  = estoqueRelatorio.filter(r=>r.indice_risco==="Promoção Urgente").length;
    const nPromocao = estoqueRelatorio.filter(r=>r.indice_risco==="Promoção").length;
    const nAtencao  = estoqueRelatorio.filter(r=>r.indice_risco==="Atenção").length;
    const nComprar  = estoqueRelatorio.filter(r=>r.indice_risco==="Comprar").length;
    const nNormal   = estoqueRelatorio.filter(r=>r.indice_risco==="Normal").length;

    doc.text(`Promoção Urgente: ${nUrgente}`, 14,  yEstoque+18);
    doc.text(`Promoção: ${nPromocao}`,         70,  yEstoque+18);
    doc.text(`Atenção: ${nAtencao}`,           110, yEstoque+18);
    doc.text(`Comprar: ${nComprar}`,           150, yEstoque+18);
    doc.text(`Normal: ${nNormal}`,             190, yEstoque+18);

    yEstoque += 28;

    // Tabela com novo formato
    autoTable(doc, {
      startY: yEstoque,
      head: [["Produto","Estoque (kg)","Cobertura (dias)","Dias em Estoque","Índice de Risco","Ação Recomendada"]],
      body: estoqueRelatorio.map(r=>[
        r.nome,
        (r.estoque??0).toLocaleString("pt-BR",{minimumFractionDigits:2}),
        r.cobertura??0,
        `${r.dias_estoque??0} dias`,
        r.indice_risco??"Normal",
        r.acao_recomendada??"Monitorar"
      ]),
      styles:{ fontSize:8, cellPadding:3 },
      headStyles:{ fillColor:[13,27,42], textColor:255, fontStyle:"bold" },
      columnStyles:{
        0:{cellWidth:35},
        1:{cellWidth:25, halign:"right"},
        2:{cellWidth:25, halign:"right"},
        3:{cellWidth:25, halign:"right"},
        4:{cellWidth:30},
        5:{cellWidth:50},
      },
      didParseCell: (data)=>{
        if(data.section==="body" && data.column.index===4){
          const v = data.cell.raw;
          if(v==="Promoção Urgente") data.cell.styles.textColor=[192,32,42];
          else if(v==="Promoção")    data.cell.styles.textColor=[217,119,6];
          else if(v==="Atenção")     data.cell.styles.textColor=[124,58,237];
          else if(v==="Comprar")     data.cell.styles.textColor=[29,111,216];
          else                       data.cell.styles.textColor=[22,163,74];
        }
      },
      margin:{ left:14, right:14 },
    });

    const pageCount = doc.internal.getNumberOfPages();
    for(let i=1; i<=pageCount; i++){
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150,150,150);
      doc.text(`Página ${i} de ${pageCount}`, 170, 285);
      doc.text("© 2026 SIGE Frigorífico Center Carnes", 14, 285);
    }

    doc.save(`relatorio-sige-${new Date().toLocaleDateString("pt-BR").replace(/\//g,"-")}.pdf`);
    setLoading(false);
  };

  return(
    <div style={{flex:1, overflowY:"auto", background:offW}}>
      <Topbar title="Relatórios"/>
      <div style={{padding:"24px 28px", display:"flex", flexDirection:"column", gap:20, maxWidth:900}}>
        <div style={{background:white, border:`1px solid ${border}`, borderRadius:12, padding:"24px"}}>
          <div style={{fontSize:16, fontWeight:700, color:txt, marginBottom:4}}>Relatório Gerencial de Vendas</div>
          <div style={{fontSize:12, color:muted, marginBottom:20}}>
            Exporta um PDF com KPIs, produtos mais vendidos, menos vendidos e situação do estoque.
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:24}}>
            {[
              {label:"Total Vendido",  value: fmtKg(dados?.total_vendido ?? 0)},
              {label:"Média Diária",   value: fmtKg(dados?.media_diaria ?? 0)},
              {label:"Mais Vendido",   value: dados?.top_produto ?? "—"},
              {label:"Menos Vendido",  value: dados?.low_produto ?? "—"},
            ].map(k=>(
              <div key={k.label} style={{background:offW, borderRadius:8, padding:"12px 16px", border:`1px solid ${border}`}}>
                <div style={{fontSize:10, color:muted, textTransform:"uppercase", fontWeight:600}}>{k.label}</div>
                <div style={{fontSize:16, fontWeight:700, color:txt, marginTop:4}}>{k.value}</div>
              </div>
            ))}
          </div>
          <button onClick={exportarPDF} disabled={!dados} style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"12px 28px",
            background: dados ? red : "#ccc",
            color:white, border:"none", borderRadius:8, fontWeight:700, fontSize:13,
            cursor: dados ? "pointer" : "not-allowed"
          }}>
            {loading ? "Gerando PDF..." : !dados ? "Carregando dados..." : "⬇ Exportar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}


function ConfiguracoesPage(){
  const [usuarios, setUsuarios] = useState([]);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalSenha, setModalSenha] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({nome:"",email:"",senha:"",perfil:"operador"});
  const [senhaForm, setSenhaForm] = useState({atual:"",nova:"",confirmar:""});
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  const userId = parseInt(localStorage.getItem("userId") || "1");

  useEffect(()=>{
    getUsuarios().then(res=>setUsuarios(res.data)).catch(()=>{});
  },[]);

  const salvarUsuario = async ()=>{
    try{
      if(editando){
        await atualizarUsuario(editando.id, {nome:form.nome, email:form.email, perfil:form.perfil});
      } else {
        await criarUsuario(form);
      }
      setMsg("Usuário salvo com sucesso!");
      setModalNovo(false);
      setEditando(null);
      setForm({nome:"",email:"",senha:"",perfil:"operador"});
      getUsuarios().then(res=>setUsuarios(res.data));
    }catch(e){
      setErro(e?.response?.data?.detail ?? "Erro ao salvar usuário");
    }
  };

  const deletarUsuario = async (id)=>{
    if(!window.confirm("Confirma exclusão do usuário?")) return;
    await excluirUsuario(id);
    getUsuarios().then(res=>setUsuarios(res.data));
  };

  const salvarSenha = async ()=>{
    if(senhaForm.nova !== senhaForm.confirmar){
      setErro("Nova senha e confirmação não conferem"); return;
    }
    try{
      await alterarSenha(userId, {senha_atual: senhaForm.atual, nova_senha: senhaForm.nova});
      setMsg("Senha alterada com sucesso!");
      setModalSenha(false);
      setSenhaForm({atual:"",nova:"",confirmar:""});
    }catch(e){
      setErro(e?.response?.data?.detail ?? "Senha atual incorreta");
    }
  };

  const perfilColor = (p) => p==="gerente" ? green : p==="operador" ? blue : orange;
  const perfilBg   = (p) => p==="gerente" ? "#DCFCE7" : p==="operador" ? "#EFF6FF" : "#FEF3C7";

  return(
    <div style={{flex:1,overflowY:"auto",background:offW}}>
      <Topbar title="Configurações"/>
      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,maxWidth:900}}>

        {/* Mensagens */}
        {msg&&<div style={{background:"#DCFCE7",border:`1px solid #BBF7D0`,borderRadius:10,padding:"12px 16px",color:green,fontWeight:600,fontSize:13,display:"flex",justifyContent:"space-between"}}>
          ✓ {msg} <span onClick={()=>setMsg(null)} style={{cursor:"pointer"}}>✕</span>
        </div>}
        {erro&&<div style={{background:"#FEE2E2",border:`1px solid #FECACA`,borderRadius:10,padding:"12px 16px",color:red,fontWeight:600,fontSize:13,display:"flex",justifyContent:"space-between"}}>
          ✕ {erro} <span onClick={()=>setErro(null)} style={{cursor:"pointer"}}>✕</span>
        </div>}

        {/* Gerenciar usuários */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"16px 24px",borderBottom:`1px solid ${border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:txt}}>Gerenciar Usuários</div>
              <div style={{fontSize:12,color:muted,marginTop:2}}>Cadastre, edite e remova usuários do sistema</div>
            </div>
            <button onClick={()=>{setModalNovo(true);setEditando(null);setForm({nome:"",email:"",senha:"",perfil:"operador"});}} style={{
              display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
              background:navy,color:white,border:"none",borderRadius:8,
              fontWeight:600,fontSize:12,cursor:"pointer"
            }}>
              + Novo Usuário
            </button>
          </div>

          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:offW}}>
                {["Nome","E-mail","Perfil","Ações"].map(h=>(
                  <th key={h} style={{padding:"10px 16px",textAlign:"left",color:muted,fontWeight:600,fontSize:11,textTransform:"uppercase",borderBottom:`1px solid ${border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${border}22`}}
                  onMouseEnter={e=>e.currentTarget.style.background=offW}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"12px 16px",color:txt,fontWeight:500}}>{u.nome}</td>
                  <td style={{padding:"12px 16px",color:muted}}>{u.email}</td>
                  <td style={{padding:"12px 16px"}}>
                    <span style={{
                      background:perfilBg(u.perfil),color:perfilColor(u.perfil),
                      fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20
                    }}>{u.perfil}</span>
                  </td>
                  <td style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setEditando(u);setForm({nome:u.nome,email:u.email,senha:"",perfil:u.perfil});setModalNovo(true);}} style={{
                        padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,
                        background:white,color:blue,fontSize:11,cursor:"pointer",fontWeight:600
                      }}>Editar</button>
                      <button onClick={()=>deletarUsuario(u.id)} style={{
                        padding:"4px 10px",borderRadius:6,border:`1px solid #FECACA`,
                        background:"#FEF2F2",color:red,fontSize:11,cursor:"pointer",fontWeight:600
                      }}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alterar senha */}
        <div style={{background:white,border:`1px solid ${border}`,borderRadius:12,padding:"24px"}}>
          <div style={{fontSize:15,fontWeight:700,color:txt,marginBottom:4}}>Alterar Senha</div>
          <div style={{fontSize:12,color:muted,marginBottom:16}}>Altere a senha da sua conta</div>
          <button onClick={()=>setModalSenha(true)} style={{
            padding:"10px 20px",background:navy,color:white,
            border:"none",borderRadius:8,fontWeight:600,fontSize:12,cursor:"pointer"
          }}>
            🔒 Alterar minha senha
          </button>
        </div>

        {/* Modal novo/editar usuário */}
        {modalNovo&&(
          <div style={{position:"fixed",inset:0,background:"#0006",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:white,borderRadius:14,padding:"28px",width:420,boxShadow:"0 8px 40px #0003"}}>
              <div style={{fontSize:16,fontWeight:700,color:txt,marginBottom:20}}>
                {editando ? "Editar Usuário" : "Novo Usuário"}
              </div>
              {[
                {label:"Nome",     key:"nome",   type:"text",     ph:"Nome completo"},
                {label:"E-mail",   key:"email",  type:"email",    ph:"email@exemplo.com"},
                {label:"Senha",    key:"senha",  type:"password", ph: editando?"Deixe em branco para manter":"Nova senha"},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:muted,display:"block",marginBottom:4}}>{f.label}</label>
                  <input type={f.type} value={form[f.key]} placeholder={f.ph}
                    onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))}
                    style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${border}`,fontSize:13,color:txt,boxSizing:"border-box"}}/>
                </div>
              ))}
              <div style={{marginBottom:20}}>
                <label style={{fontSize:12,fontWeight:600,color:muted,display:"block",marginBottom:4}}>Perfil</label>
                <select value={form.perfil} onChange={e=>setForm(v=>({...v,perfil:e.target.value}))}
                  style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${border}`,fontSize:13,color:txt}}>
                  <option value="gerente">Gerente</option>
                  <option value="operador">Operador</option>
                  <option value="estoque">Estoque</option>
                </select>
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>{setModalNovo(false);setEditando(null);}} style={{
                  padding:"9px 18px",borderRadius:8,border:`1px solid ${border}`,
                  background:white,color:muted,fontSize:12,cursor:"pointer"
                }}>Cancelar</button>
                <button onClick={salvarUsuario} style={{
                  padding:"9px 18px",borderRadius:8,border:"none",
                  background:navy,color:white,fontSize:12,fontWeight:600,cursor:"pointer"
                }}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal alterar senha */}
        {modalSenha&&(
          <div style={{position:"fixed",inset:0,background:"#0006",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:white,borderRadius:14,padding:"28px",width:400,boxShadow:"0 8px 40px #0003"}}>
              <div style={{fontSize:16,fontWeight:700,color:txt,marginBottom:20}}>Alterar Senha</div>
              {[
                {label:"Senha atual",        key:"atual",     ph:"Digite sua senha atual"},
                {label:"Nova senha",         key:"nova",      ph:"Digite a nova senha"},
                {label:"Confirmar nova senha",key:"confirmar", ph:"Confirme a nova senha"},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:muted,display:"block",marginBottom:4}}>{f.label}</label>
                  <input type="password" value={senhaForm[f.key]} placeholder={f.ph}
                    onChange={e=>setSenhaForm(v=>({...v,[f.key]:e.target.value}))}
                    style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${border}`,fontSize:13,color:txt,boxSizing:"border-box"}}/>
                </div>
              ))}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
                <button onClick={()=>setModalSenha(false)} style={{
                  padding:"9px 18px",borderRadius:8,border:`1px solid ${border}`,
                  background:white,color:muted,fontSize:12,cursor:"pointer"
                }}>Cancelar</button>
                <button onClick={salvarSenha} style={{
                  padding:"9px 18px",borderRadius:8,border:"none",
                  background:red,color:white,fontSize:12,fontWeight:600,cursor:"pointer"
                }}>Alterar Senha</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


// ── App Root ───────────────────────────────────────────────────────────────────
export default function App(){
  const [logged, setLogged] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [imported, setImported] = useState(null);

  useEffect(()=>{
    if(logged){
      getDashboard({periodo:"todos",produto:"todos",categoria:"todos",dataInicio:"",dataFim:""})
        .then(res=>{
          if(res.data?.total_vendido > 0) setImported(true);
        })
        .catch(()=>{});
    }
  },[logged]);

  const handleLogin = (p) => {
    setLogged(true);
    setPerfil(p);
    setPage("dashboard");
  };

  const handleImport = (rows)=>{
    setImported(rows);
    setPage("dashboard");
    setTimeout(()=>setImported(r => [...(r||[])]),100);
  };

    if(!logged) return <LoginPage onLogin={handleLogin}/>;
console.log("page:", page, "perfil:", perfil);
  return(
    <div style={{display:"flex",height:"100vh",fontFamily:"'Segoe UI',sans-serif",background:offW}}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/tabler-icons.min.css"/>
      <Sidebar page={page} setPage={setPage} perfil={perfil}/>
      {page==="dashboard"  && <DashboardPage imported={imported}/>}
      {page==="importacao" && <ImportacaoPage onImport={handleImport}/>}
      {page==="historico" && <HistoricoPage perfil={perfil}/>}
      {page==="relatorios" && <RelatoriosPage/>}
      {page==="config" && <ConfiguracoesPage/>}
      {page==="sair"&&(()=>{
      localStorage.removeItem("token");
      localStorage.removeItem("nome");
      localStorage.removeItem("perfil");
      setLogged(false);
      setPerfil(null);
      setPage("dashboard");
      return null;
      })()}
      {!["dashboard","importacao","historico","relatorios","config"].includes(page)&&page!=="sair"&&(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:muted}}>
          <i className="ti ti-tools" style={{fontSize:48}} aria-hidden="true"/>
          <div style={{fontSize:16,fontWeight:600}}>Módulo em desenvolvimento</div>
          <div style={{fontSize:12}}>Esta seção estará disponível em breve.</div>
        </div>
      )}
    </div>
  );
}
