import React, { useMemo, useRef, useState, useCallback } from "react";
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Svg, { Line, Defs, LinearGradient as SvgGradient, Stop, Circle } from "react-native-svg";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = { carte: any; onBack: () => void };
type Outil = "selection" | "ajouter" | "deplacer" | "relier";
type ConditionType = "points_total" | "reussir_parcours" | "reussir_parcours_tentatives";

type Noeud = {
  id: string;
  titre: string;
  ligne: number;
  colonne: number;
  parcoursMax: number;
  color: string;
};

type Condition = {
  id: string;
  type: ConditionType;
  active: boolean;
  valeur1: string;
  valeur2: string;
};

type Lien = {
  id: string;
  from: string;
  to: string;
  conditions: Condition[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_W = 160;
const CELL_H = 140;
const GRID_LEFT = 50;
const GRID_TOP = 50;
const NODE_W = CELL_W - 20;
const NODE_H = CELL_H - 20;

const NODE_COLORS = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#06B6D4",
];

const CONDITIONS_DEFAUT: Condition[] = [
  { id: "points_total", type: "points_total", active: false, valeur1: "", valeur2: "" },
  { id: "reussir_parcours", type: "reussir_parcours", active: false, valeur1: "", valeur2: "" },
  { id: "reussir_parcours_tentatives", type: "reussir_parcours_tentatives", active: false, valeur1: "", valeur2: "" },
];

const TOOL_CONFIG: { id: Outil; icon: string; feather?: string; label: string }[] = [
  { id: "ajouter", icon: "＋", label: "Ajouter" },
  { id: "selection", feather: "mouse-pointer", icon: "", label: "Sélection" },
  { id: "deplacer", feather: "move", icon: "", label: "Déplacer" },
  { id: "relier", feather: "git-merge", icon: "", label: "Relier" },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function conditionLabel(c: Condition) {
  if (c.type === "points_total") return `⭐ ${c.valeur1 || "?"} pts`;
  if (c.type === "reussir_parcours") return `✅ ${c.valeur1 || "?"} parcours`;
  return `🎯 ${c.valeur1 || "?"} / ${c.valeur2 || "?"} tentatives`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreationArbreDeCompetence({ carte, onBack }: Props) {
  const { width, height } = useWindowDimensions();
  const isPhone = width < 760;

  // State
  const [outil, setOutil] = useState<Outil>("selection");
  const [infoVisible, setInfoVisible] = useState(false);
  const [noeuds, setNoeuds] = useState<Noeud[]>([
    { id: "depart", titre: "Départ", ligne: 0, colonne: 2, parcoursMax: 0, color: "#6366F1" },
  ]);
  const [liens, setLiens] = useState<Lien[]>([]);
  const [selectedId, setSelectedId] = useState("depart");
  const [linkStartId, setLinkStartId] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editNodeVisible, setEditNodeVisible] = useState(false);
  const [nodeName, setNodeName] = useState("");
  const [nodeParcoursMax, setNodeParcoursMax] = useState("0");
  const [conditionModalLink, setConditionModalLink] = useState<Lien | null>(null);
  const [conditionsDraft, setConditionsDraft] = useState<Condition[]>([]);

  const dragStart = useRef<{ id: string; ligne: number; colonne: number } | null>(null);
  const colorIndex = useRef(1);

  // Computed
  const selectedNode = useMemo(() => noeuds.find((n) => n.id === selectedId) || null, [noeuds, selectedId]);
  const maxLigne = Math.max(5, ...noeuds.map((n) => n.ligne + 2));
  const maxColonne = Math.max(6, ...noeuds.map((n) => n.colonne + 2));
  const canvasW = Math.max(maxColonne * CELL_W + GRID_LEFT + 80, isPhone ? 900 : width - 180);
  const canvasH = Math.max(maxLigne * CELL_H + GRID_TOP + 80, height - 160);

  const pos = (n: Noeud) => ({ x: GRID_LEFT + n.colonne * CELL_W, y: GRID_TOP + n.ligne * CELL_H });
  const nodeCenter = (n: Noeud) => {
    const p = pos(n);
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
  };

  const placeOccupee = (ligne: number, colonne: number) =>
    noeuds.some((n) => n.ligne === ligne && n.colonne === colonne);

  const trouverColonneLibre = (ligne: number) => {
    for (let c = 0; c < 30; c++) if (!placeOccupee(ligne, c)) return c;
    return 0;
  };

  // Actions
  const ajouterDossier = (placement: "meme" | "dessus") => {
    const base = selectedNode || noeuds[0];
    const ligne = placement === "dessus" ? Math.max(0, base.ligne - 1) : base.ligne;
    const color = NODE_COLORS[colorIndex.current % NODE_COLORS.length];
    colorIndex.current++;

    const nouveau: Noeud = {
      id: uid(), titre: `Dossier ${noeuds.length}`,
      ligne, colonne: trouverColonneLibre(ligne),
      parcoursMax: 5, color,
    };
    setNoeuds((old) => [...old, nouveau]);
    setSelectedId(nouveau.id);
    setAddModalVisible(false);
    setOutil("selection");
  };

  const ouvrirEditNode = () => {
    if (!selectedNode) return;
    setNodeName(selectedNode.titre);
    setNodeParcoursMax(String(selectedNode.parcoursMax ?? 0));
    setEditNodeVisible(true);
  };

  const sauverNode = () => {
    if (!selectedNode) return;
    setNoeuds((old) => old.map((n) =>
      n.id === selectedNode.id
        ? { ...n, titre: nodeName.trim() || "Dossier", parcoursMax: Math.max(0, Number(nodeParcoursMax || 0)) }
        : n
    ));
    setEditNodeVisible(false);
  };

  const supprimerNode = () => {
    if (!selectedNode || selectedNode.id === "depart") return;
    setNoeuds((old) => old.filter((n) => n.id !== selectedNode.id));
    setLiens((old) => old.filter((l) => l.from !== selectedNode.id && l.to !== selectedNode.id));
    setSelectedId("depart");
  };

  const cliquerNoeud = (node: Noeud) => {
    if (outil === "relier") {
      if (!linkStartId) { setLinkStartId(node.id); setSelectedId(node.id); return; }
      if (linkStartId !== node.id) {
        const existe = liens.some((l) => l.from === linkStartId && l.to === node.id);
        if (!existe) setLiens((old) => [...old, { id: uid(), from: linkStartId, to: node.id, conditions: [] }]);
      }
      setSelectedId(node.id); setLinkStartId(null); return;
    }
    setSelectedId(node.id);
  };

  const deplacerVers = (id: string, ligne: number, colonne: number) => {
    const node = noeuds.find((n) => n.id === id);
    if (!node) return;
    const tL = Math.max(0, ligne), tC = Math.max(0, colonne);
    const autre = noeuds.find((n) => n.id !== id && n.ligne === tL && n.colonne === tC);
    setNoeuds((old) => old.map((n) => {
      if (n.id === id) return { ...n, ligne: tL, colonne: tC };
      if (autre && n.id === autre.id) return { ...n, ligne: node.ligne, colonne: node.colonne };
      return n;
    }));
  };

  const createPanResponder = useCallback((node: Noeud) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => outil === "deplacer",
      onMoveShouldSetPanResponder: () => outil === "deplacer",
      onPanResponderGrant: () => {
        dragStart.current = { id: node.id, ligne: node.ligne, colonne: node.colonne };
        setSelectedId(node.id);
      },
      onPanResponderRelease: (_, g) => {
        if (!dragStart.current) return;
        const dc = Math.round(g.dx / CELL_W);
        const dl = Math.round(g.dy / CELL_H);
        deplacerVers(dragStart.current.id, dragStart.current.ligne + dl, dragStart.current.colonne + dc);
        dragStart.current = null;
      },
    }), [outil, noeuds]);

  // Phone move helper
  const deplacerMobile = (dir: "up" | "down" | "left" | "right") => {
    if (!selectedNode) return;
    const { ligne, colonne } = selectedNode;
    const dl = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    deplacerVers(selectedNode.id, ligne + dl, colonne + dc);
  };

  // Conditions
  const ouvrirConditions = (lien: Lien) => {
    const merged = CONDITIONS_DEFAUT.map((base) => {
      const existing = lien.conditions.find((c) => c.type === base.type);
      return existing || { ...base, id: uid() };
    });
    setConditionModalLink(lien);
    setConditionsDraft(merged);
  };

  const maxParcoursDepuisLien = useMemo(() => {
    if (!conditionModalLink) return 0;
    const from = noeuds.find((n) => n.id === conditionModalLink.from);
    return from?.parcoursMax ?? 0;
  }, [conditionModalLink, noeuds]);

  const clampParcours = (value: string) => {
    const n = Math.max(0, Math.min(maxParcoursDepuisLien || 999, Number(value || 0)));
    return Number.isFinite(n) ? String(n) : "";
  };

  const toggleCondition = (type: ConditionType) =>
    setConditionsDraft((old) => old.map((c) => c.type === type ? { ...c, active: !c.active } : c));

  const majCondition = (type: ConditionType, patch: Partial<Condition>) =>
    setConditionsDraft((old) => old.map((c) => c.type === type ? { ...c, ...patch } : c));

  const sauverConditions = () => {
    if (!conditionModalLink) return;
    setLiens((old) => old.map((l) =>
      l.id === conditionModalLink.id ? { ...l, conditions: conditionsDraft.filter((c) => c.active) } : l
    ));
    setConditionModalLink(null);
  };

  const supprimerLien = () => {
    if (!conditionModalLink) return;
    setLiens((old) => old.filter((l) => l.id !== conditionModalLink.id));
    setConditionModalLink(null);
  };

  const sauvegarder = () =>
    Alert.alert("💾 Sauvegarde", "Prochaine étape : sauvegarde Supabase de cet arbre.");

  const lienFromNode = conditionModalLink ? noeuds.find((n) => n.id === conditionModalLink.from) : null;
  const lienToNode = conditionModalLink ? noeuds.find((n) => n.id === conditionModalLink.to) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.safe}>
      {/* Background */}
      <LinearGradient colors={["#0F0C29", "#302B63", "#24243E"]} style={StyleSheet.absoluteFill} />

      {/* Decorative dots */}
      <View style={S.dots} pointerEvents="none">
        {[...Array(30)].map((_, i) => (
          <View
            key={i}
            style={[S.dot, {
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              opacity: 0.04 + (i % 5) * 0.02,
              width: 2 + (i % 4),
              height: 2 + (i % 4),
            }]}
          />
        ))}
      </View>

      {/* ── TOP BAR ── */}
      <View style={S.topBar}>
        <TouchableOpacity onPress={onBack} style={S.backBtn} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#E2E8F0" />
          <Text style={S.backText}>Retour</Text>
        </TouchableOpacity>

        <View style={S.titleBox}>
          <Text style={S.titleMain}>Arbre de compétence</Text>
          <View style={S.titleBadge}>
            <Text style={S.titleBadgeText}>{carte?.nom || "Carte sans nom"}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setInfoVisible(true)} style={S.iconBtn} activeOpacity={0.8}>
          <Feather name="help-circle" size={20} color="#A5B4FC" />
        </TouchableOpacity>

        <TouchableOpacity onPress={sauvegarder} style={S.saveBtn} activeOpacity={0.8}>
          <Feather name="save" size={17} color="white" />
          <Text style={S.saveBtnText}>Sauver</Text>
        </TouchableOpacity>
      </View>

      {/* ── BODY ── */}
      <View style={S.body}>
        {/* ── TOOLS BAR ── */}
        <View style={S.toolsBar}>
          {TOOL_CONFIG.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={[S.toolBtn, outil === tool.id && S.toolBtnActive]}
              onPress={() => {
                if (tool.id === "ajouter") { setOutil("ajouter"); setAddModalVisible(true); }
                else { setOutil(tool.id); setLinkStartId(null); }
              }}
              activeOpacity={0.8}
            >
              {tool.feather ? (
                <Feather name={tool.feather as any} size={20} color={outil === tool.id ? "#1E1B4B" : "#A5B4FC"} />
              ) : (
                <Text style={[S.toolIcon, outil === tool.id && { color: "#1E1B4B" }]}>{tool.icon}</Text>
              )}
              <Text style={[S.toolLabel, outil === tool.id && { color: "#1E1B4B" }]}>{tool.label}</Text>
            </TouchableOpacity>
          ))}

          {/* Link indicator */}
          {outil === "relier" && (
            <View style={S.linkStatus}>
              <View style={[S.linkDot, { backgroundColor: linkStartId ? "#10B981" : "#6366F1" }]} />
              <Text style={S.linkStatusText}>
                {linkStartId ? "→ 2ème" : "1er nœud"}
              </Text>
            </View>
          )}

          {/* Stats */}
          <View style={S.toolStats}>
            <Text style={S.toolStatN}>{noeuds.length}</Text>
            <Text style={S.toolStatL}>nœuds</Text>
            <Text style={S.toolStatN}>{liens.length}</Text>
            <Text style={S.toolStatL}>liens</Text>
          </View>
        </View>

        {/* ── CANVAS ── */}
        <View style={S.canvasWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: canvasW }}>
            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: canvasW, height: canvasH }}>
              <View style={[S.canvas, { width: canvasW, height: canvasH }]}>

                {/* Grid dots */}
                {Array.from({ length: maxLigne + 1 }).map((_, l) =>
                  Array.from({ length: maxColonne + 1 }).map((__, c) => (
                    <View key={`${l}-${c}`} style={[S.gridDot, {
                      left: GRID_LEFT + c * CELL_W - 3,
                      top: GRID_TOP + l * CELL_H - 3,
                    }]} />
                  ))
                )}

                {/* Grid cells highlight for drop target */}
                {outil === "deplacer" && Array.from({ length: maxLigne + 1 }).map((_, l) =>
                  Array.from({ length: maxColonne + 1 }).map((__, c) => (
                    !placeOccupee(l, c) && (
                      <View key={`cell-${l}-${c}`} style={[S.gridCellEmpty, {
                        left: GRID_LEFT + c * CELL_W,
                        top: GRID_TOP + l * CELL_H,
                        width: NODE_W,
                        height: NODE_H,
                      }]} />
                    )
                  ))
                )}

                {/* SVG Lines */}
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Defs>
                    <SvgGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <Stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
                      <Stop offset="100%" stopColor="#10B981" stopOpacity="0.8" />
                    </SvgGradient>
                  </Defs>
                  {liens.map((lien) => {
                    const from = noeuds.find((n) => n.id === lien.from);
                    const to = noeuds.find((n) => n.id === lien.to);
                    if (!from || !to) return null;
                    const a = nodeCenter(from), b = nodeCenter(to);
                    return (
                      <React.Fragment key={lien.id}>
                        {/* Shadow */}
                        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke="#000" strokeWidth="10" strokeOpacity="0.3" strokeLinecap="round" />
                        {/* Main */}
                        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke="url(#lineGrad)" strokeWidth="5" strokeLinecap="round"
                          strokeDasharray={lien.conditions.length === 0 ? "10,6" : undefined} />
                        {/* Dots at ends */}
                        <Circle cx={a.x} cy={a.y} r="7" fill="#6366F1" />
                        <Circle cx={b.x} cy={b.y} r="7" fill="#10B981" />
                      </React.Fragment>
                    );
                  })}
                </Svg>

                {/* Link bubbles */}
                {liens.map((lien) => {
                  const from = noeuds.find((n) => n.id === lien.from);
                  const to = noeuds.find((n) => n.id === lien.to);
                  if (!from || !to) return null;
                  const a = nodeCenter(from), b = nodeCenter(to);
                  const hasConditions = lien.conditions.length > 0;
                  const label = hasConditions ? lien.conditions.map(conditionLabel).join(" • ") : "Définir conditions";

                  return (
                    <TouchableOpacity
                      key={lien.id}
                      onPress={() => ouvrirConditions(lien)}
                      style={[S.linkBubble, {
                        left: (a.x + b.x) / 2 - 72,
                        top: (a.y + b.y) / 2 - 16,
                        borderColor: hasConditions ? "#10B981" : "#6366F1",
                      }]}
                      activeOpacity={0.85}
                    >
                      <Text style={S.lockIcon}>{hasConditions ? "🔒" : "+"}</Text>
                      <Text numberOfLines={1} style={[S.linkBubbleText, { color: hasConditions ? "#10B981" : "#A5B4FC" }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Nodes */}
                {noeuds.map((node) => {
                  const p = pos(node);
                  const selected = selectedId === node.id;
                  const isStart = linkStartId === node.id;
                  const pan = createPanResponder(node);
                  const isDepart = node.id === "depart";

                  return (
                    <TouchableOpacity
                      key={node.id}
                      {...pan.panHandlers}
                      onPress={() => cliquerNoeud(node)}
                      activeOpacity={0.9}
                      style={[S.node, {
                        left: p.x, top: p.y,
                        width: NODE_W, height: NODE_H,
                      }]}
                    >
                      {/* Glow */}
                      {selected && (
                        <View style={[S.nodeGlow, { backgroundColor: node.color }]} />
                      )}

                      {/* Card */}
                      <LinearGradient
                        colors={selected
                          ? [node.color, `${node.color}CC`]
                          : isStart
                          ? ["#065F46", "#047857"]
                          : ["#1E1B4B", "#2D2A5E"]}
                        style={S.nodeCard}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        {/* Top accent */}
                        <View style={[S.nodeAccent, { backgroundColor: node.color }]} />

                        {/* Icon area */}
                        <View style={[S.nodeIconBox, { borderColor: `${node.color}60` }]}>
                          <Text style={S.nodeEmoji}>{isDepart ? "🏁" : "🗂️"}</Text>
                        </View>

                        <Text numberOfLines={2} style={S.nodeTitle}>{node.titre}</Text>

                        {!isDepart && (
                          <View style={[S.nodeCountBadge, { backgroundColor: `${node.color}30` }]}>
                            <Text style={[S.nodeCountText, { color: node.color }]}>
                              {node.parcoursMax} parcours
                            </Text>
                          </View>
                        )}

                        {isStart && (
                          <View style={S.linkingBadge}>
                            <Text style={S.linkingBadgeText}>ORIGIN</Text>
                          </View>
                        )}

                        {/* Selection ring */}
                        {selected && (
                          <View style={[S.selectedRing, { borderColor: node.color }]} />
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>

        {/* ── RIGHT PANEL (tablet/desktop only) ── */}
        {!isPhone && (
          <View style={S.rightPanel}>
            <Text style={S.panelHeading}>Sélection</Text>

            {selectedNode ? (
              <>
                <View style={[S.panelNodePreview, { borderColor: selectedNode.color }]}>
                  <Text style={S.panelNodeEmoji}>{selectedNode.id === "depart" ? "🏁" : "🗂️"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={S.panelNodeName}>{selectedNode.titre}</Text>
                    {selectedNode.id !== "depart" && (
                      <Text style={[S.panelNodeSub, { color: selectedNode.color }]}>
                        {selectedNode.parcoursMax} parcours
                      </Text>
                    )}
                  </View>
                </View>

                <TouchableOpacity style={S.panelBtn} onPress={ouvrirEditNode} activeOpacity={0.8}>
                  <Feather name="edit-2" size={15} color="#A5B4FC" style={{ marginRight: 8 }} />
                  <Text style={S.panelBtnText}>Modifier le dossier</Text>
                </TouchableOpacity>

                {outil === "deplacer" && (
                  <View style={S.moveArrows}>
                    <Text style={S.moveLabel}>Déplacer</Text>
                    <View style={S.arrowRow}>
                      <View style={{ width: 44 }} />
                      <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("up")}>
                        <Feather name="arrow-up" size={18} color="white" />
                      </TouchableOpacity>
                      <View style={{ width: 44 }} />
                    </View>
                    <View style={S.arrowRow}>
                      <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("left")}>
                        <Feather name="arrow-left" size={18} color="white" />
                      </TouchableOpacity>
                      <View style={[S.arrowBtn, { backgroundColor: "transparent" }]} />
                      <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("right")}>
                        <Feather name="arrow-right" size={18} color="white" />
                      </TouchableOpacity>
                    </View>
                    <View style={S.arrowRow}>
                      <View style={{ width: 44 }} />
                      <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("down")}>
                        <Feather name="arrow-down" size={18} color="white" />
                      </TouchableOpacity>
                      <View style={{ width: 44 }} />
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[S.panelDanger, selectedNode.id === "depart" && { opacity: 0.3 }]}
                  onPress={supprimerNode}
                  disabled={selectedNode.id === "depart"}
                  activeOpacity={0.8}
                >
                  <Feather name="trash-2" size={15} color="#F87171" style={{ marginRight: 8 }} />
                  <Text style={S.panelDangerText}>Supprimer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={S.panelEmpty}>Aucun nœud sélectionné</Text>
            )}

            {/* Hint */}
            <View style={S.hintBox}>
              <Text style={S.hintTitle}>
                {outil === "selection" ? "🖱️ Sélection" :
                 outil === "deplacer" ? "✋ Déplacement" :
                 outil === "relier" ? "🔗 Liaison" : "➕ Ajout"}
              </Text>
              <Text style={S.hintText}>
                {outil === "deplacer"
                  ? "Glisse un nœud pour le déplacer. Les nœuds s'échangent si la case est prise."
                  : outil === "relier"
                  ? linkStartId
                    ? "Clique maintenant sur le nœud d'arrivée."
                    : "Clique sur le nœud de départ du lien."
                  : outil === "ajouter"
                  ? "Clique sur + pour ajouter un dossier."
                  : "Clique sur un nœud pour le sélectionner."}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Phone: move arrows when deplacer tool */}
      {isPhone && outil === "deplacer" && selectedNode && (
        <View style={S.phoneArrows}>
          <View style={S.arrowRow}>
            <View style={{ width: 44 }} />
            <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("up")}>
              <Feather name="arrow-up" size={18} color="white" />
            </TouchableOpacity>
          </View>
          <View style={S.arrowRow}>
            <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("left")}>
              <Feather name="arrow-left" size={18} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("down")}>
              <Feather name="arrow-down" size={18} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={S.arrowBtn} onPress={() => deplacerMobile("right")}>
              <Feather name="arrow-right" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── MODAL: Ajouter ── */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setAddModalVisible(false)}>
          <Pressable style={S.modalCard}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Ajouter un dossier</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={S.modalSub}>Où placer le nouveau dossier ?</Text>

            <TouchableOpacity style={S.choiceCard} onPress={() => ajouterDossier("meme")} activeOpacity={0.85}>
              <LinearGradient colors={["#4F46E5", "#6366F1"]} style={S.choiceGradient}>
                <Text style={S.choiceEmoji}>➡️</Text>
                <View>
                  <Text style={S.choiceTitle}>Même ligne</Text>
                  <Text style={S.choiceSub}>À côté du nœud sélectionné</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={S.choiceCard} onPress={() => ajouterDossier("dessus")} activeOpacity={0.85}>
              <LinearGradient colors={["#0891B2", "#06B6D4"]} style={S.choiceGradient}>
                <Text style={S.choiceEmoji}>⬆️</Text>
                <View>
                  <Text style={S.choiceTitle}>Ligne du dessus</Text>
                  <Text style={S.choiceSub}>Niveau supérieur de l'arbre</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── MODAL: Editer nœud ── */}
      <Modal visible={editNodeVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setEditNodeVisible(false)}>
          <Pressable style={S.modalCard}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Modifier le dossier</Text>
              <TouchableOpacity onPress={() => setEditNodeVisible(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={S.inputLabel}>Nom du dossier</Text>
            <TextInput
              value={nodeName} onChangeText={setNodeName}
              style={S.input} placeholder="Ex: Fractions, Conjugaison…"
              placeholderTextColor="#4B5563" selectionColor="#6366F1"
            />

            <Text style={S.inputLabel}>Nombre de parcours dans ce dossier</Text>
            <TextInput
              value={nodeParcoursMax} onChangeText={setNodeParcoursMax}
              keyboardType="numeric" style={S.input}
              placeholder="Ex: 5" placeholderTextColor="#4B5563" selectionColor="#6366F1"
            />

            <TouchableOpacity style={S.primaryBtn} onPress={sauverNode} activeOpacity={0.85}>
              <LinearGradient colors={["#4F46E5", "#6366F1"]} style={S.primaryBtnGrad}>
                <Feather name="check" size={18} color="white" style={{ marginRight: 8 }} />
                <Text style={S.primaryBtnText}>Valider</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── MODAL: Conditions ── */}
      <Modal visible={!!conditionModalLink} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setConditionModalLink(null)}>
          <Pressable style={S.modalCardLarge}>
            <View style={S.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.modalTitle}>Conditions de déblocage</Text>
                {lienFromNode && lienToNode && (
                  <Text style={S.modalSub}>
                    <Text style={{ color: lienFromNode.color }}>{lienFromNode.titre}</Text>
                    {" → "}
                    <Text style={{ color: lienToNode.color }}>{lienToNode.titre}</Text>
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setConditionModalLink(null)}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {maxParcoursDepuisLien > 0 && (
              <View style={S.infoChip}>
                <Feather name="info" size={13} color="#6366F1" style={{ marginRight: 6 }} />
                <Text style={S.infoChipText}>
                  Dossier précédent : {maxParcoursDepuisLien} parcours max
                </Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {conditionsDraft.map((c) => (
                <TouchableOpacity
                  key={c.type}
                  activeOpacity={0.9}
                  onPress={() => toggleCondition(c.type)}
                  style={[S.condCard, c.active && S.condCardActive]}
                >
                  <View style={S.condHeader}>
                    <View style={[S.condCheck, c.active && S.condCheckActive]}>
                      {c.active && <Feather name="check" size={14} color="white" />}
                    </View>
                    <Text style={[S.condTitle, c.active && { color: "#E0E7FF" }]}>
                      {c.type === "points_total" ? "⭐ Atteindre X points au total"
                       : c.type === "reussir_parcours" ? "✅ Réussir X parcours du dossier"
                       : "🎯 Réussir X parcours en Y tentatives"}
                    </Text>
                  </View>

                  {c.type === "points_total" && (
                    <TextInput value={c.valeur1}
                      onChangeText={(v) => majCondition(c.type, { valeur1: v, active: true })}
                      keyboardType="numeric" style={S.condInput}
                      placeholder="Nombre de points requis" placeholderTextColor="#6B7280"
                      selectionColor="#6366F1"
                    />
                  )}

                  {c.type === "reussir_parcours" && (
                    <TextInput value={c.valeur1}
                      onChangeText={(v) => majCondition(c.type, { valeur1: clampParcours(v), active: true })}
                      keyboardType="numeric" style={S.condInput}
                      placeholder={`Nb parcours réussis (max ${maxParcoursDepuisLien})`}
                      placeholderTextColor="#6B7280" selectionColor="#6366F1"
                    />
                  )}

                  {c.type === "reussir_parcours_tentatives" && (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TextInput value={c.valeur1}
                        onChangeText={(v) => majCondition(c.type, { valeur1: clampParcours(v), active: true })}
                        keyboardType="numeric" style={[S.condInput, { flex: 1 }]}
                        placeholder="X parcours" placeholderTextColor="#6B7280" selectionColor="#6366F1"
                      />
                      <TextInput value={c.valeur2}
                        onChangeText={(v) => majCondition(c.type, { valeur2: v, active: true })}
                        keyboardType="numeric" style={[S.condInput, { flex: 1 }]}
                        placeholder="Y tentatives" placeholderTextColor="#6B7280" selectionColor="#6366F1"
                      />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={S.condActions}>
              <TouchableOpacity style={S.deleteLinkBtn} onPress={supprimerLien} activeOpacity={0.8}>
                <Feather name="trash-2" size={15} color="#F87171" style={{ marginRight: 6 }} />
                <Text style={S.deleteLinkText}>Supprimer le lien</Text>
              </TouchableOpacity>

              <TouchableOpacity style={S.primaryBtnSmall} onPress={sauverConditions} activeOpacity={0.85}>
                <LinearGradient colors={["#4F46E5", "#6366F1"]} style={S.primaryBtnSmallGrad}>
                  <Feather name="check" size={16} color="white" style={{ marginRight: 6 }} />
                  <Text style={S.primaryBtnText}>Valider</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── MODAL: Légende ── */}
      <Modal visible={infoVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setInfoVisible(false)}>
          <Pressable style={S.modalCard}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Légende des outils</Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            {[
              { icon: "＋", text: "Ajouter un dossier sur la même ligne ou au dessus" },
              { icon: "🖱️", text: "Sélectionner un nœud pour le modifier" },
              { icon: "✋", text: "Glisser-déposer un nœud (échange si case occupée)" },
              { icon: "🔗", text: "Relier : cliquer sur 2 nœuds pour créer un lien" },
              { icon: "🔒", text: "Cliquer sur un lien pour définir ses conditions" },
            ].map((item, i) => (
              <View key={i} style={S.legendRow}>
                <Text style={S.legendIcon}>{item.icon}</Text>
                <Text style={S.legendText}>{item.text}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0F0C29" },

  dots: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  dot: { position: "absolute", borderRadius: 99, backgroundColor: "white" },

  // Top bar
  topBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99,102,241,0.2)",
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  backText: { color: "#E2E8F0", fontSize: 14, fontWeight: "700" },
  titleBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  titleMain: { color: "white", fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  titleBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20, backgroundColor: "rgba(99,102,241,0.25)",
    borderWidth: 1, borderColor: "rgba(99,102,241,0.5)",
  },
  titleBadgeText: { color: "#A5B4FC", fontSize: 12, fontWeight: "700" },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: "#4F46E5",
    shadowColor: "#6366F1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10,
  },
  saveBtnText: { color: "white", fontSize: 13, fontWeight: "800" },

  // Body
  body: { flex: 1, flexDirection: "row", padding: 10, gap: 10 },

  // Tools
  toolsBar: {
    width: 76,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: "center", gap: 6,
  },
  toolBtn: {
    width: 60, paddingVertical: 10,
    borderRadius: 14, alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1, borderColor: "transparent",
    gap: 4,
  },
  toolBtnActive: {
    backgroundColor: "#A5B4FC",
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "#6366F1", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 12,
  },
  toolIcon: { fontSize: 22, color: "#A5B4FC" },
  toolLabel: { color: "#6B7280", fontSize: 9, fontWeight: "700", textAlign: "center" },
  linkStatus: { alignItems: "center", gap: 4, marginTop: 4 },
  linkDot: { width: 8, height: 8, borderRadius: 4 },
  linkStatusText: { color: "#94A3B8", fontSize: 9, fontWeight: "700" },
  toolStats: { marginTop: "auto" as any, alignItems: "center", gap: 0 },
  toolStatN: { color: "white", fontSize: 18, fontWeight: "800", lineHeight: 22 },
  toolStatL: { color: "#4B5563", fontSize: 9, fontWeight: "700", marginBottom: 6 },

  // Canvas
  canvasWrap: { flex: 1, borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  canvas: { position: "relative", backgroundColor: "transparent" },
  gridDot: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(99,102,241,0.15)" },
  gridCellEmpty: { position: "absolute", borderRadius: 18, borderWidth: 2, borderColor: "rgba(99,102,241,0.1)", borderStyle: "dashed" },

  // Nodes
  node: { position: "absolute", zIndex: 20 },
  nodeGlow: { position: "absolute", inset: -8, borderRadius: 26, opacity: 0.3, zIndex: -1 },
  nodeCard: { flex: 1, borderRadius: 22, padding: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nodeAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  nodeIconBox: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  nodeEmoji: { fontSize: 28 },
  nodeTitle: { color: "white", fontSize: 13, fontWeight: "800", textAlign: "center", letterSpacing: -0.2 },
  nodeCountBadge: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  nodeCountText: { fontSize: 11, fontWeight: "800" },
  linkingBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  linkingBadgeText: { color: "white", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  selectedRing: { position: "absolute", inset: 0, borderRadius: 22, borderWidth: 3 },

  // Link bubbles
  linkBubble: {
    position: "absolute", zIndex: 30,
    flexDirection: "row", alignItems: "center", gap: 4,
    width: 144, paddingVertical: 5, paddingHorizontal: 8,
    backgroundColor: "#0F172A", borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
  },
  lockIcon: { fontSize: 11 },
  linkBubbleText: { flex: 1, fontSize: 9, fontWeight: "800", textAlign: "left" },

  // Right panel
  rightPanel: {
    width: 240, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    padding: 14, gap: 8,
  },
  panelHeading: { color: "#4B5563", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  panelNodePreview: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 2 },
  panelNodeEmoji: { fontSize: 28 },
  panelNodeName: { color: "white", fontSize: 15, fontWeight: "800" },
  panelNodeSub: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  panelBtn: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: "rgba(99,102,241,0.12)", borderWidth: 1, borderColor: "rgba(99,102,241,0.25)" },
  panelBtnText: { color: "#A5B4FC", fontSize: 13, fontWeight: "700" },
  panelDanger: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" },
  panelDangerText: { color: "#F87171", fontSize: 13, fontWeight: "700" },
  panelEmpty: { color: "#374151", fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 20 },
  hintBox: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: "rgba(99,102,241,0.08)", borderWidth: 1, borderColor: "rgba(99,102,241,0.15)" },
  hintTitle: { color: "#A5B4FC", fontSize: 12, fontWeight: "800", marginBottom: 6 },
  hintText: { color: "#6B7280", fontSize: 12, fontWeight: "600", lineHeight: 18 },

  // Move arrows
  moveArrows: { alignItems: "center", gap: 6, paddingVertical: 8 },
  moveLabel: { color: "#4B5563", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  arrowRow: { flexDirection: "row", gap: 6 },
  arrowBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(99,102,241,0.2)", borderWidth: 1, borderColor: "rgba(99,102,241,0.3)", alignItems: "center", justifyContent: "center" },
  phoneArrows: { position: "absolute", bottom: 100, right: 20, gap: 6 },

  // Modals
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, backgroundColor: "#0F172A", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "rgba(99,102,241,0.25)" },
  modalCardLarge: { width: "100%", maxWidth: 600, backgroundColor: "#0F172A", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "rgba(99,102,241,0.25)" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { color: "white", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  modalSub: { color: "#6B7280", fontSize: 13, fontWeight: "600", lineHeight: 18, marginBottom: 8 },

  // Choice cards
  choiceCard: { borderRadius: 18, overflow: "hidden", marginTop: 10 },
  choiceGradient: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  choiceEmoji: { fontSize: 28 },
  choiceTitle: { color: "white", fontSize: 16, fontWeight: "800" },
  choiceSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600", marginTop: 2 },

  // Input
  inputLabel: { color: "#6B7280", fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: "rgba(99,102,241,0.3)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontWeight: "700", color: "white", backgroundColor: "rgba(255,255,255,0.04)", fontSize: 15 },

  // Primary button
  primaryBtn: { borderRadius: 14, overflow: "hidden", marginTop: 18 },
  primaryBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  primaryBtnSmall: { borderRadius: 14, overflow: "hidden" },
  primaryBtnSmallGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 12 },
  primaryBtnText: { color: "white", fontSize: 15, fontWeight: "800" },

  // Info chip
  infoChip: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: "rgba(99,102,241,0.1)", borderWidth: 1, borderColor: "rgba(99,102,241,0.2)", marginBottom: 12 },
  infoChipText: { color: "#818CF8", fontSize: 12, fontWeight: "700" },

  // Conditions
  condCard: { padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 2, borderColor: "rgba(255,255,255,0.06)", marginBottom: 10 },
  condCardActive: { backgroundColor: "rgba(99,102,241,0.12)", borderColor: "#6366F1" },
  condHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  condCheck: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: "#374151", alignItems: "center", justifyContent: "center" },
  condCheckActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  condTitle: { flex: 1, color: "#94A3B8", fontSize: 14, fontWeight: "700" },
  condInput: { marginTop: 8, borderWidth: 1.5, borderColor: "rgba(99,102,241,0.3)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontWeight: "700", color: "white", backgroundColor: "rgba(255,255,255,0.04)", fontSize: 14 },

  // Cond actions
  condActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 16 },
  deleteLinkBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" },
  deleteLinkText: { color: "#F87171", fontSize: 13, fontWeight: "700" },

  // Legend
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 12 },
  legendIcon: { fontSize: 18, width: 28, textAlign: "center" },
  legendText: { flex: 1, color: "#94A3B8", fontSize: 14, fontWeight: "600", lineHeight: 20 },
});