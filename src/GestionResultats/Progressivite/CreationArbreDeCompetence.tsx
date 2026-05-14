import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  carte: any;
  onBack: () => void;
  onOpenCarte?: (carte: any) => void;
};

type Outil =
  | "selection"
  | "ajouter"
  | "deplacer"
  | "relier"
  | "ciseaux"
  | "supprimer";

type Noeud = {
  id: string;
  titre: string;
  ligne: number;
  colonne: number;
  color: string;
};

type Lien = {
  id: string;
  from: string;
  to: string;
};

type PageArbre = {
  id: string;
  nom: string;
  noeuds: Noeud[];
  liens: Lien[];
};

type PendingAction = "move" | "add" | null;

const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const HEADER_TITLE = "#FFFFFF";
const CONTENT_BG = "#EEF3F7";
const CONTENT_BORDER = "#C6D2DC";
const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#C9D5DF";
const CARD_TITLE = "#233548";
const CARD_SUBTITLE = "#5F7386";
const TEXT_BG = "#E8F1FD";
const DANGER = "#EF4444";
const SUCCESS = "#22C55E";
const WARNING = "#F59E0B";

const COLORS = [
  "#1F5B86",
  "#2D6C97",
  "#38BDF8",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
  "#EF4444",
  "#14B8A6",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultPage(): PageArbre {
  return {
    id: uid(),
    nom: "Barème 1",
    noeuds: [],
    liens: [],
  };
}

export default function CreationArbreDeCompetence({
  carte,
  onBack,
  onOpenCarte,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isPhone = width < 760;

  const CELL_W = isPhone ? 96 : 160;
  const CELL_H = isPhone ? 88 : 140;
  const ROW_GAP = isPhone ? 70 : 120;
  const GRID_LEFT = isPhone ? 20 : 50;
  const GRID_TOP = isPhone ? 20 : 50;
  const NODE_W = isPhone ? 82 : CELL_W - 20;
  const NODE_H = isPhone ? 72 : CELL_H - 20;

  const ligneToY = (ligne: number) => GRID_TOP + ligne * (CELL_H + ROW_GAP);

  const storageKey = `arbre_competence_${carte?.id || "default"}`;

  const [outil, setOutil] = useState<Outil>("selection");
  const [pages, setPages] = useState<PageArbre[]>([createDefaultPage()]);
  const [pageId, setPageId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    ligne: number;
    colonne: number;
  } | null>(null);
  const [pendingAddTarget, setPendingAddTarget] = useState<{
    ligne: number;
    colonne: number;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [linkStartId, setLinkStartId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteNodeVisible, setDeleteNodeVisible] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Noeud | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [breakWarningVisible, setBreakWarningVisible] = useState(false);
  const [breakWillRemoveLinks, setBreakWillRemoveLinks] = useState<Lien[]>([]);
  const [quitWarningVisible, setQuitWarningVisible] = useState(false);
  const [unlinkedWarningIds, setUnlinkedWarningIds] = useState<string[]>([]);

  const loadedRef = useRef(false);
  const colorIndex = useRef(1);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!mounted) return;

        if (raw) {
          const data = JSON.parse(raw);

          if (Array.isArray(data?.pages) && data.pages.length > 0) {
            const fixedPages: PageArbre[] = data.pages.map((p: any) => ({
              ...p,
              liens: Array.isArray(p.liens) ? p.liens : [],
              noeuds:
                Array.isArray(p.noeuds) && p.noeuds.length > 0
                  ? p.noeuds
                  : createDefaultPage().noeuds,
            }));

            setPages(fixedPages);
            setPageId(data.pageId || fixedPages[0].id);
            setSelectedId(
              data.selectedId || fixedPages[0]?.noeuds?.[0]?.id || ""
            );
          } else {
            const first = createDefaultPage();
            setPages([first]);
            setPageId(first.id);
            setSelectedId(first.noeuds[0]?.id || "");
          }
        } else {
          const first = createDefaultPage();
          setPages([first]);
          setPageId(first.id);
          setSelectedId(first.noeuds[0]?.id || "");
        }
      } catch {
        const first = createDefaultPage();
        setPages([first]);
        setPageId(first.id);
        setSelectedId(first.noeuds[0]?.id || "");
      } finally {
        loadedRef.current = true;
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current) return;

    AsyncStorage.setItem(
      storageKey,
      JSON.stringify({
        pages,
        pageId,
        selectedId,
      })
    ).catch(() => {});
  }, [pages, pageId, selectedId, storageKey]);

  const pageActive = useMemo(
    () => pages.find((p) => p.id === pageId) || pages[0],
    [pages, pageId]
  );

  const noeuds = pageActive?.noeuds || [];
  const liens = pageActive?.liens || [];

  const selectedNode = useMemo(
    () => noeuds.find((n) => n.id === selectedId) || noeuds[0] || null,
    [noeuds, selectedId]
  );

  const moveSource = useMemo(
    () => noeuds.find((n) => n.id === moveSourceId) || null,
    [noeuds, moveSourceId]
  );

  const selectedLink = useMemo(
    () => liens.find((l) => l.id === selectedLinkId) || null,
    [liens, selectedLinkId]
  );

  const unlinkedNodes = useMemo(() => {
    if (noeuds.length <= 1) return [];

    return noeuds.filter(
      (node) => !liens.some((lien) => lien.from === node.id || lien.to === node.id)
    );
  }, [noeuds, liens]);

  const hintText = useMemo(() => {
    if (breakWarningVisible || quitWarningVisible) return "Valide ou annule avant de continuer";

    if (outil === "relier") {
      return linkStartId ? "Clique sur une carte voisine" : "Clique sur la carte de départ";
    }

    if (outil === "supprimer") return "Clique sur une carte à supprimer";

    if (outil === "ciseaux") {
      return selectedLink ? "Lien sélectionné : coupe en bas" : "Clique sur un trait";
    }

    if (outil === "deplacer") {
      return moveSource ? "Clique sur une case puis confirme" : "Clique sur la carte à déplacer";
    }

    if (outil === "ajouter") return "Clique sur une case libre pour ajouter une carte";

    return "Clique sur une carte pour l'ouvrir";
  }, [
    breakWarningVisible,
    quitWarningVisible,
    outil,
    linkStartId,
    selectedLink,
    moveSource,
  ]);

  const maxLigne = Math.max(6, ...noeuds.map((n) => n.ligne + 3));
  const maxColonne = Math.max(7, ...noeuds.map((n) => n.colonne + 3));

  const canvasW = Math.max(
    maxColonne * CELL_W + GRID_LEFT + 80,
    isPhone ? 760 : width - 110
  );

  const canvasH = Math.max(
    ligneToY(maxLigne) + CELL_H + 80,
    isPhone ? height - 165 : height - 150
  );

  const isBlockingPromptOpen =
    breakWarningVisible ||
    quitWarningVisible ||
    renameVisible ||
    deleteConfirmVisible ||
    deleteNodeVisible;

  const canScrollCanvas =
    !breakWarningVisible && !quitWarningVisible && !renameVisible && !deleteConfirmVisible;

  const updateCurrentPage = (updater: (page: PageArbre) => PageArbre) => {
    setPages((old) =>
      old.map((p) => (p.id === pageActive.id ? updater(p) : p))
    );
  };

  const pos = (n: Noeud) => ({
    x: GRID_LEFT + n.colonne * CELL_W,
    y: ligneToY(n.ligne),
  });

  const pointsConnexion = (n: Noeud) => {
    const p = pos(n);

    return {
      haut: { x: p.x + NODE_W / 2, y: p.y },
      bas: { x: p.x + NODE_W / 2, y: p.y + NODE_H },
      gauche: { x: p.x, y: p.y + NODE_H / 2 },
      droite: { x: p.x + NODE_W, y: p.y + NODE_H / 2 },
    };
  };

  const getNoeudAt = (
    ligne: number,
    colonne: number,
    liste: Noeud[] = noeuds,
    ignoreIds: string[] = []
  ) => {
    return (
      liste.find(
        (n) =>
          !ignoreIds.includes(n.id) &&
          n.ligne === ligne &&
          n.colonne === colonne
      ) || null
    );
  };

  const cartesEntre = (
    from: Noeud,
    to: Noeud,
    liste: Noeud[] = noeuds
  ) => {
    if (from.ligne === to.ligne) {
      const minCol = Math.min(from.colonne, to.colonne);
      const maxCol = Math.max(from.colonne, to.colonne);

      for (let c = minCol + 1; c < maxCol; c += 1) {
        const carte = getNoeudAt(from.ligne, c, liste, [from.id, to.id]);
        if (carte) return true;
      }

      return false;
    }

    if (from.colonne === to.colonne) {
      const minLigne = Math.min(from.ligne, to.ligne);
      const maxLigne = Math.max(from.ligne, to.ligne);

      for (let l = minLigne + 1; l < maxLigne; l += 1) {
        const carte = getNoeudAt(l, from.colonne, liste, [from.id, to.id]);
        if (carte) return true;
      }

      return false;
    }

    return false;
  };

  const lienValideDansListe = (
    from: Noeud,
    to: Noeud,
    liste: Noeud[] = noeuds
  ) => {
    const dl = Math.abs(from.ligne - to.ligne);
    const dc = Math.abs(from.colonne - to.colonne);

    if (dl === 0 && dc === 0) return false;

    if (from.ligne === to.ligne) {
      return !cartesEntre(from, to, liste);
    }

    if (from.colonne === to.colonne) {
      return !cartesEntre(from, to, liste);
    }

    if (dl === 1) return true;

    return false;
  };

  const peutRelier = (from: Noeud, to: Noeud) => {
    return lienValideDansListe(from, to, noeuds);
  };

  const connectorPoints = (from: Noeud, to: Noeud) => {
    const pf = pointsConnexion(from);
    const pt = pointsConnexion(to);

    if (from.ligne === to.ligne) {
      if (from.colonne < to.colonne) {
        return { a: pf.droite, b: pt.gauche, mode: "horizontal" as const };
      }

      return { a: pf.gauche, b: pt.droite, mode: "horizontal" as const };
    }

    if (from.ligne < to.ligne) {
      return { a: pf.bas, b: pt.haut, mode: "vertical" as const };
    }

    return { a: pf.haut, b: pt.bas, mode: "vertical" as const };
  };

  const creerCheminLien = (from: Noeud, to: Noeud) => {
    const { a, b, mode } = connectorPoints(from, to);

    if (mode === "horizontal") {
      const midX = (a.x + b.x) / 2;
      return {
        a,
        b,
        d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
      };
    }

    const midY = (a.y + b.y) / 2;
    return {
      a,
      b,
      d: `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`,
    };
  };

  const placeOccupee = (ligne: number, colonne: number) =>
    noeuds.some((n) => n.ligne === ligne && n.colonne === colonne);

  const peutAjouterSurCase = (ligne: number, colonne: number) => {
    return !placeOccupee(ligne, colonne);
  };

  const segmentCoupeRectangle = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { left: number; right: number; top: number; bottom: number }
  ) => {
    const marge = 8;
    const left = rect.left + marge;
    const right = rect.right - marge;
    const top = rect.top + marge;
    const bottom = rect.bottom - marge;

    if (Math.abs(a.x - b.x) < 0.5) {
      const x = a.x;
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);

      return x >= left && x <= right && maxY >= top && minY <= bottom;
    }

    if (Math.abs(a.y - b.y) < 0.5) {
      const y = a.y;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);

      return y >= top && y <= bottom && maxX >= left && minX <= right;
    }

    return false;
  };

  const lienTraverseCase = (lien: Lien, ligne: number, colonne: number) => {
    const from = noeuds.find((n) => n.id === lien.from);
    const to = noeuds.find((n) => n.id === lien.to);

    if (!from || !to) return true;

    const { a, b } = creerCheminLien(from, to);
    const rect = {
      left: GRID_LEFT + colonne * CELL_W,
      right: GRID_LEFT + colonne * CELL_W + NODE_W,
      top: ligneToY(ligne),
      bottom: ligneToY(ligne) + NODE_H,
    };

    if (from.ligne === to.ligne) {
      const midX = (a.x + b.x) / 2;
      return (
        segmentCoupeRectangle(a, { x: midX, y: a.y }, rect) ||
        segmentCoupeRectangle({ x: midX, y: a.y }, { x: midX, y: b.y }, rect) ||
        segmentCoupeRectangle({ x: midX, y: b.y }, b, rect)
      );
    }

    const midY = (a.y + b.y) / 2;
    return (
      segmentCoupeRectangle(a, { x: a.x, y: midY }, rect) ||
      segmentCoupeRectangle({ x: a.x, y: midY }, { x: b.x, y: midY }, rect) ||
      segmentCoupeRectangle({ x: b.x, y: midY }, b, rect)
    );
  };

  const liensCoupesParAjout = (ligne: number, colonne: number) => {
    const noeudTemporaire: Noeud = {
      id: "__temp_add__",
      titre: "temp",
      ligne,
      colonne,
      color: "#FFFFFF",
    };

    const listeSimulee = [...noeuds, noeudTemporaire];

    return liens.filter((l) => {
      const from = listeSimulee.find((n) => n.id === l.from);
      const to = listeSimulee.find((n) => n.id === l.to);

      if (!from || !to) return true;

      if (!lienValideDansListe(from, to, listeSimulee)) return true;

      return lienTraverseCase(l, ligne, colonne);
    });
  };

  const ajouterNoeudSurCase = (
    ligne: number,
    colonne: number,
    options?: { skipWarning?: boolean }
  ) => {
    if (!peutAjouterSurCase(ligne, colonne)) return;

    const liensCasses = liensCoupesParAjout(ligne, colonne);

    if (liensCasses.length > 0 && !options?.skipWarning) {
      setPendingAction("add");
      setPendingAddTarget({ ligne, colonne });
      setBreakWillRemoveLinks(liensCasses);
      setBreakWarningVisible(true);
      return;
    }

    const color = COLORS[colorIndex.current % COLORS.length];
    colorIndex.current += 1;

    const nouveau: Noeud = {
      id: uid(),
      titre: `Carte ${noeuds.length + 1}`,
      ligne,
      colonne,
      color,
    };

    updateCurrentPage((p) => ({
      ...p,
      noeuds: [...p.noeuds, nouveau],
    }));

    setSelectedId(nouveau.id);
    setPendingAction(null);
    setPendingAddTarget(null);
    setBreakWarningVisible(false);
    setBreakWillRemoveLinks([]);
  };

  const simulerNoeudsApresDeplacement = (
    node: Noeud,
    futureLigne: number,
    futureColonne: number
  ) => {
    const autre = noeuds.find(
      (n) =>
        n.id !== node.id &&
        n.ligne === futureLigne &&
        n.colonne === futureColonne
    );

    return noeuds.map((n) => {
      if (n.id === node.id) {
        return { ...n, ligne: futureLigne, colonne: futureColonne };
      }

      if (autre && n.id === autre.id) {
        return { ...n, ligne: node.ligne, colonne: node.colonne };
      }

      return n;
    });
  };

  const deplacementVaCasserLiens = (
    node: Noeud,
    futureLigne: number,
    futureColonne: number
  ) => {
    const noeudsSimules = simulerNoeudsApresDeplacement(
      node,
      futureLigne,
      futureColonne
    );

    const autre = noeuds.find(
      (n) =>
        n.id !== node.id &&
        n.ligne === futureLigne &&
        n.colonne === futureColonne
    );

    return liens.filter((l) => {
      const from = noeudsSimules.find((n) => n.id === l.from);
      const to = noeudsSimules.find((n) => n.id === l.to);

      if (!from || !to) return true;

      const ancienneFrom = noeuds.find((n) => n.id === l.from);
      const ancienneTo = noeuds.find((n) => n.id === l.to);

      const fromABouge =
        ancienneFrom &&
        (ancienneFrom.ligne !== from.ligne ||
          ancienneFrom.colonne !== from.colonne);

      const toABouge =
        ancienneTo &&
        (ancienneTo.ligne !== to.ligne || ancienneTo.colonne !== to.colonne);

      if ((fromABouge || toABouge) && !lienValideDansListe(from, to, noeudsSimules)) {
        return true;
      }

      const lienEstCeluiDuNoeudDeplace = l.from === node.id || l.to === node.id;
      if (!lienEstCeluiDuNoeudDeplace && lienTraverseCase(l, futureLigne, futureColonne)) {
        return true;
      }

      if (autre) {
        const lienEstCeluiDeLaCarteEchangee = l.from === autre.id || l.to === autre.id;
        if (!lienEstCeluiDeLaCarteEchangee && lienTraverseCase(l, node.ligne, node.colonne)) {
          return true;
        }
      }

      return false;
    });
  };

  const appliquerDeplacement = (cible: { ligne: number; colonne: number }) => {
    if (!moveSource) return;

    const tL = Math.max(0, cible.ligne);
    const tC = Math.max(0, cible.colonne);

    const autre = noeuds.find(
      (n) => n.id !== moveSource.id && n.ligne === tL && n.colonne === tC
    );

    updateCurrentPage((p) => ({
      ...p,
      noeuds: p.noeuds.map((n) => {
        if (n.id === moveSource.id) {
          return { ...n, ligne: tL, colonne: tC };
        }

        if (autre && n.id === autre.id) {
          return {
            ...n,
            ligne: moveSource.ligne,
            colonne: moveSource.colonne,
          };
        }

        return n;
      }),
    }));

    setSelectedId(moveSource.id);
    setMoveSourceId(null);
    setMoveTarget(null);
    setPendingAction(null);
    setBreakWarningVisible(false);
    setBreakWillRemoveLinks([]);
  };

  const confirmerDeplacement = (
    targetOverride?: { ligne: number; colonne: number },
    force = false
  ) => {
    const cible = targetOverride || moveTarget;
    if (!moveSource || !cible) return;

    const tL = Math.max(0, cible.ligne);
    const tC = Math.max(0, cible.colonne);

    const liensCasses = deplacementVaCasserLiens(moveSource, tL, tC);

    if (liensCasses.length > 0 && !force) {
      setPendingAction("move");
      setBreakWillRemoveLinks(liensCasses);
      setBreakWarningVisible(true);
      return;
    }

    appliquerDeplacement({ ligne: tL, colonne: tC });
  };

  const annulerWarning = () => {
    setBreakWarningVisible(false);
    setBreakWillRemoveLinks([]);
    setPendingAction(null);
    setPendingAddTarget(null);
    setMoveTarget(null);
  };

  const validerWarning = () => {
    updateCurrentPage((p) => ({
      ...p,
      liens: p.liens.filter(
        (l) => !breakWillRemoveLinks.some((x) => x.id === l.id)
      ),
    }));

    if (pendingAction === "add" && pendingAddTarget) {
      const cible = pendingAddTarget;
      setBreakWarningVisible(false);
      setBreakWillRemoveLinks([]);
      setPendingAction(null);
      setPendingAddTarget(null);
      ajouterNoeudSurCase(cible.ligne, cible.colonne, { skipWarning: true });
      return;
    }

    if (pendingAction === "move" && moveTarget) {
      const cible = moveTarget;
      setBreakWarningVisible(false);
      setBreakWillRemoveLinks([]);
      setPendingAction(null);
      appliquerDeplacement(cible);
    }
  };

  const gererClicNoeud = (node: Noeud) => {
    if (isBlockingPromptOpen) return;
    if (outil === "ciseaux") return;

    if (outil === "supprimer") {
      setSelectedId(node.id);
      setSelectedLinkId(null);

      const liensAssocies = liens.filter(
        (lien) =>
          lien.from === node.id ||
          lien.to === node.id ||
          lienTraverseCase(lien, node.ligne, node.colonne)
      );

      setBreakWillRemoveLinks(liensAssocies);
      setNodeToDelete(node);
      setDeleteNodeVisible(true);
      return;
    }

    if (outil === "ajouter") {
      setSelectedId(node.id);
      return;
    }

    if (outil === "selection") {
      setSelectedId(node.id);

      onOpenCarte?.({
        ...node,
        nom: node.titre,
        arbre_page_id: pageActive.id,
        arbre_page_nom: pageActive.nom,
        carte_parent: carte,
      });

      return;
    }

    if (outil === "deplacer") {
      if (!moveSourceId) {
        setSelectedId(node.id);
        setMoveSourceId(node.id);
      } else if (moveSourceId !== node.id) {
        const cible = { ligne: node.ligne, colonne: node.colonne };
        setMoveTarget(cible);
        confirmerDeplacement(cible);
      }

      return;
    }

    if (outil === "relier") {
      setSelectedId(node.id);
      setLinkError("");

      if (!linkStartId) {
        setLinkStartId(node.id);
        return;
      }

      if (linkStartId === node.id) {
        setLinkStartId(null);
        return;
      }

      const fromNode = noeuds.find((n) => n.id === linkStartId);
      const toNode = node;

      if (!fromNode) {
        setLinkStartId(null);
        return;
      }

      if (!peutRelier(fromNode, toNode)) {
        const memeLigne = fromNode.ligne === toNode.ligne;
        const memeColonne = fromNode.colonne === toNode.colonne;

        if (memeLigne) {
          setLinkError(
            "Impossible de relier ces 2 cartes : une carte se situe entre elles sur la ligne."
          );
        } else if (memeColonne) {
          setLinkError(
            "Impossible de relier ces 2 cartes : une carte se situe entre elles sur la colonne."
          );
        } else {
          setLinkError(
            "Impossible de relier ces 2 cartes : elles ne sont pas voisines."
          );
        }

        setTimeout(() => setLinkError(""), 2400);
        setLinkStartId(null);
        return;
      }

      const exists = liens.some(
        (l) =>
          (l.from === linkStartId && l.to === node.id) ||
          (l.from === node.id && l.to === linkStartId)
      );

      if (!exists) {
        const newLink: Lien = {
          id: uid(),
          from: linkStartId,
          to: node.id,
        };

        updateCurrentPage((p) => ({
          ...p,
          liens: [...(p.liens || []), newLink],
        }));
      }

      setLinkStartId(null);
    }
  };

  const couperLienSelectionne = () => {
    if (!selectedLinkId || isBlockingPromptOpen) return;

    updateCurrentPage((p) => ({
      ...p,
      liens: p.liens.filter((l) => l.id !== selectedLinkId),
    }));

    setSelectedLinkId(null);
  };

  const supprimerNoeud = (node: Noeud) => {
    updateCurrentPage((p) => ({
      ...p,
      noeuds: p.noeuds.filter((n) => n.id !== node.id),
      liens: p.liens.filter(
        (l) =>
          l.from !== node.id &&
          l.to !== node.id &&
          !lienTraverseCase(l, node.ligne, node.colonne)
      ),
    }));

    const autreNoeud = noeuds.find((n) => n.id !== node.id);

    if (autreNoeud) {
      setSelectedId(autreNoeud.id);
    }

    setDeleteNodeVisible(false);
    setNodeToDelete(null);
  };

  const creerPage = () => {
    if (isBlockingPromptOpen) return;

    const newPage = {
      ...createDefaultPage(),
      nom: `Barème ${pages.length + 1}`,
    };

    setPages((old) => [...old, newPage]);
    setPageId(newPage.id);
    setSelectedId("");
  };

  const supprimerPage = () => {
    if (pages.length <= 1) return;

    const remaining = pages.filter((p) => p.id !== pageActive.id);

    setPages(remaining);
    setPageId(remaining[0].id);
    setSelectedId("");
  };

  const validerRenommerPage = () => {
    const clean = renameValue.trim() || "Barème";

    updateCurrentPage((p) => ({
      ...p,
      nom: clean,
    }));

    setRenameVisible(false);
  };

  function demanderRetour() {
    if (deleteNodeVisible) {
      setDeleteNodeVisible(false);
      setNodeToDelete(null);
      setBreakWillRemoveLinks([]);
      return;
    }

    if (breakWarningVisible) {
      annulerWarning();
      return;
    }

    if (quitWarningVisible) {
      setQuitWarningVisible(false);
      setUnlinkedWarningIds([]);
      return;
    }

    if (renameVisible) {
      setRenameVisible(false);
      return;
    }

    if (deleteConfirmVisible) {
      setDeleteConfirmVisible(false);
      return;
    }

    if (unlinkedNodes.length > 0) {
      setUnlinkedWarningIds(unlinkedNodes.map((n) => n.id));
      setQuitWarningVisible(true);
      return;
    }

    onBack();
  }

  function changeOutil(next: Outil) {
    if (isBlockingPromptOpen) return;

    setOutil(next);
    setMoveSourceId(null);
    setMoveTarget(null);
    setPendingAddTarget(null);
    setPendingAction(null);
    setLinkStartId(null);
    setSelectedLinkId(null);
    setLinkError("");
  }

  const renderLiensSVG = (interactive: boolean) => {
    const orderedLiens = [...liens].sort((a, b) => {
      const aDelete =
        deleteNodeVisible &&
        !!nodeToDelete &&
        (a.from === nodeToDelete.id ||
          a.to === nodeToDelete.id ||
          lienTraverseCase(a, nodeToDelete.ligne, nodeToDelete.colonne) ||
          breakWillRemoveLinks.some((x) => x.id === a.id));
      const bDelete =
        deleteNodeVisible &&
        !!nodeToDelete &&
        (b.from === nodeToDelete.id ||
          b.to === nodeToDelete.id ||
          lienTraverseCase(b, nodeToDelete.ligne, nodeToDelete.colonne) ||
          breakWillRemoveLinks.some((x) => x.id === b.id));

      if (aDelete && !bDelete) return 1;
      if (!aDelete && bDelete) return -1;
      if (a.id === selectedLinkId) return 1;
      if (b.id === selectedLinkId) return -1;
      return 0;
    });

    return (
      <Svg
        width={canvasW}
        height={canvasH}
        style={[
          StyleSheet.absoluteFill,
          interactive ? { zIndex: 20 } : { zIndex: 5 },
        ]}
        pointerEvents={interactive && !isBlockingPromptOpen ? "auto" : "none"}
      >
        {orderedLiens.map((lien) => {
          const from = noeuds.find((n) => n.id === lien.from);
          const to = noeuds.find((n) => n.id === lien.to);

          if (!from || !to) return null;

          const { a, b, d } = creerCheminLien(from, to);
          const isSelected = selectedLinkId === lien.id;
          const deleteTargetId = deleteNodeVisible
            ? nodeToDelete?.id || selectedId
            : null;
          const isDeleteTargetLink =
            !!deleteTargetId &&
            (lien.from === deleteTargetId ||
              lien.to === deleteTargetId ||
              (!!nodeToDelete &&
                lienTraverseCase(
                  lien,
                  nodeToDelete.ligne,
                  nodeToDelete.colonne
                )));
          const willBreak =
            (breakWarningVisible &&
              breakWillRemoveLinks.some((x) => x.id === lien.id)) ||
            (deleteNodeVisible &&
              (isDeleteTargetLink ||
                breakWillRemoveLinks.some((x) => x.id === lien.id)));

          if (interactive) {
            return (
              <Path
                key={`hit-${lien.id}`}
                d={d}
                stroke="rgba(255,0,0,0.001)"
                strokeWidth={34}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                onPress={() => {
                  if (!isBlockingPromptOpen) setSelectedLinkId(lien.id);
                }}
              />
            );
          }

          return (
            <React.Fragment key={lien.id}>
              <Path
                d={d}
                stroke="rgba(15,23,42,0.18)"
                strokeWidth={isSelected || willBreak ? 11 : 9}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isSelected || willBreak ? 0.75 : 0.45}
              />
              <Path
                d={d}
                stroke={isSelected || willBreak ? DANGER : SUCCESS}
                strokeWidth={isSelected || willBreak ? 6 : 5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={1}
              />
              <Path
                d={d}
                stroke={isSelected || willBreak ? "#FCA5A5" : "#BBF7D0"}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isSelected || willBreak ? 1 : 0.75}
              />
              <Circle
                cx={a.x}
                cy={a.y}
                r={isSelected || willBreak ? 6 : 5}
                fill={isSelected || willBreak ? DANGER : SUCCESS}
                opacity={1}
              />
              <Circle
                cx={b.x}
                cy={b.y}
                r={isSelected || willBreak ? 6 : 5}
                fill={isSelected || willBreak ? DANGER : SUCCESS}
                opacity={1}
              />
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  const renderDeleteLinksOverlay = () => {
    if (!deleteNodeVisible) return null;

    const deleteTargetId = nodeToDelete?.id || selectedId;
    if (!deleteTargetId) return null;

    const liensASupprimer = liens.filter(
      (lien) =>
        lien.from === deleteTargetId ||
        lien.to === deleteTargetId ||
        (!!nodeToDelete &&
          lienTraverseCase(lien, nodeToDelete.ligne, nodeToDelete.colonne)) ||
        breakWillRemoveLinks.some((x) => x.id === lien.id)
    );

    if (liensASupprimer.length === 0) return null;

    return (
      <Svg
        width={canvasW}
        height={canvasH}
        style={[StyleSheet.absoluteFill, S.deleteLinksSvg]}
        pointerEvents="none"
      >
        {liensASupprimer.map((lien) => {
          const from = noeuds.find((n) => n.id === lien.from);
          const to = noeuds.find((n) => n.id === lien.to);

          if (!from || !to) return null;

          const { d } = creerCheminLien(from, to);

          return (
            <React.Fragment key={`delete-overlay-${lien.id}`}>
              <Path
                d={d}
                stroke="rgba(127,29,29,0.35)"
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
              <Path
                d={d}
                stroke={DANGER}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={1}
              />
              <Path
                d={d}
                stroke="#FCA5A5"
                strokeWidth={1.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  const renderTools = () => (
    <>
      {(
        [
          ["ajouter", "＋", "Ajouter", "#1F5B86"],
          ["selection", "mouse-pointer", "Sélection", "#1F5B86"],
          ["deplacer", "move", "Déplacer", "#1F5B86"],
          ["relier", "git-merge", "Relier", "#1F5B86"],
          ["supprimer", "slash", "Supprimer", "#1F5B86"],
        ] as any[]
      ).map(([id, icon, label, color]) => (
        <TouchableOpacity
          key={id}
          style={[S.toolBtn, outil === id && S.toolBtnActive]}
          onPress={() => changeOutil(id)}
          activeOpacity={0.85}
          disabled={isBlockingPromptOpen}
        >
          {id === "ajouter" ? (
            <Text
              style={[
                S.toolIcon,
                { color: outil === id ? HEADER_TITLE : color },
              ]}
            >
              {icon}
            </Text>
          ) : (
            <Feather
              name={icon}
              size={isPhone ? 17 : 20}
              color={outil === id ? HEADER_TITLE : color}
            />
          )}

          <Text
            style={[
              S.toolLabel,
              { color: outil === id ? HEADER_TITLE : color },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[S.toolBtn, outil === "ciseaux" && S.toolBtnActive]}
        onPress={() => changeOutil("ciseaux")}
        activeOpacity={0.85}
        disabled={isBlockingPromptOpen}
      >
        <Feather
          name="scissors"
          size={isPhone ? 17 : 20}
          color={outil === "ciseaux" ? HEADER_TITLE : HEADER_BG}
        />

        <Text style={[S.toolLabel, outil === "ciseaux" && S.toolLabelActive]}>
          Ciseaux
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={S.safe}>
      <View style={S.topBar}>
        <TouchableOpacity
          onPress={demanderRetour}
          style={S.backBtn}
          disabled={false}
          activeOpacity={0.9}
        >
          <Feather name="arrow-left" size={20} color={HEADER_TITLE} />
        </TouchableOpacity>

        <View style={S.titleBox}>
          <Text style={S.titleMain}>Arbre de compétences</Text>
          <Text style={S.titleSub} numberOfLines={1}>
            {carte?.nom || carte?.titre || "Carte de compétence"}
          </Text>
        </View>

        <TouchableOpacity
          style={S.infoBtn}
          disabled={isBlockingPromptOpen}
          onPress={() => setInfoVisible(true)}
          activeOpacity={0.9}
        >
          <Feather name="info" size={18} color={HEADER_TITLE} />
        </TouchableOpacity>
      </View>

      <View style={S.pagesBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.pagesScroll}
        >
          {pages.map((p) => {
            const active = p.id === pageActive.id;

            return (
              <TouchableOpacity
                key={p.id}
                style={[S.pageChip, active && S.pageChipActive]}
                disabled={isBlockingPromptOpen}
                onPress={() => {
                  setPageId(p.id);
                  setSelectedId(p.noeuds[0]?.id || "");
                }}
              >
                <Text
                  style={[S.pageChipText, active && S.pageChipTextActive]}
                >
                  {p.nom}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={S.pageAddBtn}
            onPress={creerPage}
            disabled={isBlockingPromptOpen}
          >
            <Feather name="plus" size={16} color={HEADER_TITLE} />
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          style={S.pageActionBtn}
          disabled={isBlockingPromptOpen}
          onPress={() => {
            setRenameValue(pageActive?.nom || "");
            setRenameVisible(true);
          }}
        >
          <Feather name="edit-2" size={14} color={HEADER_BG} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.pageActionBtn, pages.length <= 1 && { opacity: 0.35 }]}
          onPress={() => pages.length > 1 && setDeleteConfirmVisible(true)}
          disabled={pages.length <= 1 || isBlockingPromptOpen}
        >
          <Feather name="trash-2" size={14} color={DANGER} />
        </TouchableOpacity>
      </View>

      {isPhone && (
        <>
          <View style={S.mobileToolsBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
              alwaysBounceVertical={false}
              directionalLockEnabled
              nestedScrollEnabled={false}
              scrollEventThrottle={16}
              style={S.mobileToolsHorizontalScroll}
              contentContainerStyle={S.mobileToolsScroll}
            >
              {renderTools()}
            </ScrollView>
          </View>

          <View style={S.inlineHintBar}>
            <Text style={S.inlineHintText}>{hintText}</Text>
          </View>
        </>
      )}

      {!isPhone && (
        <View style={S.inlineHintBarDesktop}>
          <Text style={S.inlineHintText}>{hintText}</Text>
        </View>
      )}

      <View style={S.body}>
        {!isPhone && (
          <View style={S.toolsBar}>
            {renderTools()}

            <View style={S.toolStats}>
              <Text style={S.toolStatN}>{noeuds.length}</Text>
              <Text style={S.toolStatL}>cartes</Text>
              <Text style={S.toolStatN}>{liens.length}</Text>
              <Text style={S.toolStatL}>liens</Text>
            </View>
          </View>
        )}

        <View style={S.canvasWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: canvasW }}
            scrollEnabled={canScrollCanvas}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: canvasW, height: canvasH }}
              scrollEnabled={canScrollCanvas}
            >
              <View style={[S.canvas, { width: canvasW, height: canvasH }]}> 
                {renderLiensSVG(false)}
                {deleteNodeVisible && renderDeleteLinksOverlay()}
                {outil === "ciseaux" && renderLiensSVG(true)}

                {Array.from({ length: maxLigne + 1 }).map((_, l) =>
                  Array.from({ length: maxColonne + 1 }).map((__, c) => {
                    const occupied = placeOccupee(l, c);

                    const canAdd =
                      !isBlockingPromptOpen &&
                      outil === "ajouter" &&
                      peutAjouterSurCase(l, c);

                    const canMoveTarget =
                      !isBlockingPromptOpen &&
                      outil === "deplacer" &&
                      !!moveSource &&
                      !(moveSource.ligne === l && moveSource.colonne === c);

                    const activeCell = canAdd || canMoveTarget;
                    const addWouldBreak =
                      canAdd && liensCoupesParAjout(l, c).length > 0;

                    return (
                      <TouchableOpacity
                        key={`${l}-${c}`}
                        activeOpacity={activeCell ? 0.7 : 1}
                        disabled={!activeCell}
                        onPress={() => {
                          if (canAdd) {
                            ajouterNoeudSurCase(l, c);
                            return;
                          }

                          if (canMoveTarget) {
                            const cible = { ligne: l, colonne: c };
                            setMoveTarget(cible);
                            confirmerDeplacement(cible);
                          }
                        }}
                        style={[
                          S.gridCell,
                          {
                            left: GRID_LEFT + c * CELL_W,
                            top: ligneToY(l),
                            width: NODE_W,
                            height: NODE_H,
                          },
                          occupied && S.gridCellOccupied,
                          canAdd && S.gridCellAdd,
                          addWouldBreak && S.gridCellAddDanger,
                          canMoveTarget && S.gridCellMove,
                          moveTarget?.ligne === l &&
                            moveTarget?.colonne === c &&
                            S.gridCellChosen,
                        ]}
                      >
                        {canAdd && (
                          <Text
                            style={[
                              S.gridAddText,
                              addWouldBreak && S.gridAddTextDanger,
                            ]}
                          >
                            ＋
                          </Text>
                        )}

                        {canMoveTarget && !occupied && (
                          <Text style={S.gridMoveText}>ici</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}

                {noeuds.map((node) => {
                  const p = pos(node);
                  const selected = selectedId === node.id;
                  const isMoveSource = moveSourceId === node.id;
                  const isLinkStart = linkStartId === node.id;
                  const isDeleteTarget = deleteNodeVisible && nodeToDelete?.id === node.id;
                  const isUnlinkedWarning =
                    quitWarningVisible && unlinkedWarningIds.includes(node.id);

                  const bgColor = isMoveSource
                    ? WARNING
                    : isLinkStart
                    ? SUCCESS
                    : selected
                    ? node.color
                    : CARD_BG;

                  const borderColor = isUnlinkedWarning
                    ? DANGER
                    : isDeleteTarget
                    ? "#FCA5A5"
                    : isMoveSource
                    ? "#FCD34D"
                    : isLinkStart
                    ? "#86EFAC"
                    : selected
                    ? HEADER_BG
                    : CARD_BORDER;

                  const textColor = selected || isMoveSource || isLinkStart || isUnlinkedWarning ? HEADER_TITLE : CARD_TITLE;

                  return (
                    <Pressable
                      key={node.id}
                      onPress={() => gererClicNoeud(node)}
                      disabled={isBlockingPromptOpen}
                      style={[
                        S.node,
                        {
                          left: p.x,
                          top: p.y,
                          width: NODE_W,
                          height: NODE_H,
                          backgroundColor: isUnlinkedWarning ? DANGER : bgColor,
                          borderColor,
                        },
                        selected && S.nodeSelected,
                        isMoveSource && S.nodeMoveSource,
                        isLinkStart && S.nodeLinkStart,
                        isDeleteTarget && S.nodeDeleteTarget,
                        isUnlinkedWarning && S.nodeUnlinkedWarning,
                      ]}
                    >
                      <LinearGradient
                        colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0)"]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />

                      <View pointerEvents="none" style={S.nodeContent}>
                        <View
                          style={[
                            S.nodeIconBox,
                            {
                              borderColor: selected || isMoveSource || isLinkStart ? "rgba(255,255,255,0.75)" : TEXT_BG,
                              backgroundColor: selected || isMoveSource || isLinkStart ? "rgba(255,255,255,0.16)" : TEXT_BG,
                            },
                          ]}
                        >
                          <Text style={S.nodeEmoji}>🧩</Text>
                        </View>

                        <Text numberOfLines={2} style={[S.nodeTitle, { color: textColor }]}> 
                          {node.titre}
                        </Text>

                        {isMoveSource && <Text style={S.badge}>À déplacer</Text>}
                        {isLinkStart && <Text style={S.badge}>Départ lien</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </View>

      {!!linkError && !breakWarningVisible && (
        <View style={S.toast}>
          <Text style={S.toastText}>{linkError}</Text>
        </View>
      )}

      {outil === "ciseaux" && selectedLink && !breakWarningVisible && (
        <View style={S.cutOverlay}>
          <Text style={S.cutOverlayText}>Lien sélectionné</Text>

          <TouchableOpacity style={S.cutCancelBtn} onPress={() => setSelectedLinkId(null)}>
            <Text style={S.cutCancelText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity style={S.cutConfirmBtn} onPress={couperLienSelectionne}>
            <Text style={S.cutConfirmText}>Couper</Text>
          </TouchableOpacity>
        </View>
      )}

      {quitWarningVisible && (
        <View style={S.blockingLayer} pointerEvents="auto">
          <View style={S.breakWarningBar}>
            <View style={S.breakWarningTextBox}>
              <Text style={S.breakWarningTitle}>Attention : une carte n'est pas reliée.</Text>
              <Text style={S.breakWarningText}>
                {unlinkedNodes.length > 1
                  ? `${unlinkedNodes.length} cartes ne sont pas reliées. Elles sont affichées en rouge. Êtes-vous certain de vouloir quitter ?`
                  : `Une carte n'est pas reliée. Elle est affichée en rouge. Êtes-vous certain de vouloir quitter ?`}
              </Text>
            </View>

            <View style={S.breakWarningActions}>
              <TouchableOpacity
                style={S.breakCancelBtn}
                onPress={() => {
                  setQuitWarningVisible(false);
                  setUnlinkedWarningIds([]);
                }}
              >
                <Text style={S.breakCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity style={S.breakConfirmBtn} onPress={onBack}>
                <Text style={S.breakConfirmText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {breakWarningVisible && (
        <View style={S.blockingLayer} pointerEvents="auto">
          <View style={S.breakWarningBar}>
            <View style={S.breakWarningTextBox}>
              <Text style={S.breakWarningTitle}>Attention : les liens rouges vont être supprimés.</Text>
              <Text style={S.breakWarningText}>
                {pendingAction === "add"
                  ? `Cette case est placée sur le chemin d'un lien. Si tu ajoutes une carte ici, cela va couper ${breakWillRemoveLinks.length} lien${breakWillRemoveLinks.length > 1 ? "s" : ""}.`
                  : `Êtes-vous certain de souhaiter déplacer cette carte ici ? Cela va couper ${breakWillRemoveLinks.length} lien${breakWillRemoveLinks.length > 1 ? "s" : ""}.`}
              </Text>
            </View>

            <View style={S.breakWarningActions}>
              <TouchableOpacity style={S.breakCancelBtn} onPress={annulerWarning}>
                <Text style={S.breakCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity style={S.breakConfirmBtn} onPress={validerWarning}>
                <Text style={S.breakConfirmText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal visible={infoVisible} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={S.infoModalBg} onPress={() => setInfoVisible(false)}>
          <Pressable style={S.infoModalCard} onPress={() => {}}>
            <View style={S.infoModalHeader}>
              <View style={S.infoBigIcon}>
                <Feather name="info" size={22} color={HEADER_BG} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.infoModalTitle}>Comment fonctionne l'arbre ?</Text>
                <Text style={S.infoModalSubtitle}>
                  Construis un barème en plaçant des cartes puis en créant des liens entre elles.
                </Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={S.infoScrollContent}
              nestedScrollEnabled={true}
              bounces={true}
              scrollEventThrottle={16}
            >
              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>1. Ajouter des cartes</Text>
                <View style={S.infoIllustrationRow}>
                  <View style={S.infoMiniCardDashed}><Text style={S.infoMiniPlus}>＋</Text></View>
                  <Feather name="arrow-right" size={18} color={HEADER_BG} />
                  <View style={S.infoMiniCardBlue}><Text style={S.infoMiniEmoji}>🧩</Text><Text style={S.infoMiniCardText}>Carte</Text></View>
                </View>
                <Text style={S.infoText}>
                  Choisis l'outil Ajouter, puis clique sur une case libre. Le barème commence vide : tu places toi-même la première carte.
                </Text>
              </View>

              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>2. Relier les cartes</Text>
                <View style={S.infoLinkDemo}>
                  <View style={S.infoMiniCard}><Text style={S.infoMiniCardTextDark}>Carte 1</Text></View>
                  <View style={S.infoGreenLine} />
                  <View style={S.infoMiniCard}><Text style={S.infoMiniCardTextDark}>Carte 2</Text></View>
                </View>
                <Text style={S.infoText}>
                  Choisis Relier, clique sur une première carte, puis clique sur une deuxième carte. Un lien vert apparaît. Les liens servent à montrer quelles cartes sont connectées dans ton barème.
                </Text>
              </View>

              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>3. Déplacer sans casser le barème</Text>
                <View style={S.infoLinkDemo}>
                  <View style={S.infoMiniCard}><Text style={S.infoMiniCardTextDark}>Carte</Text></View>
                  <View style={S.infoRedLine} />
                  <View style={S.infoMiniCardWarning}><Text style={S.infoMiniCardText}>!</Text></View>
                </View>
                <Text style={S.infoText}>
                  Si tu déplaces ou ajoutes une carte sur un lien, l'application te prévient. Le lien concerné devient rouge et tu dois choisir Valider ou Annuler avant de continuer.
                </Text>
              </View>

              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>4. Supprimer ou couper</Text>
                <Text style={S.infoText}>
                  L'outil Supprimer efface une carte après confirmation. Les liens qui disparaîtront sont affichés en rouge. L'outil Ciseaux sert uniquement à couper un lien sélectionné.
                </Text>
              </View>

              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>5. Avant de quitter</Text>
                <Text style={S.infoText}>
                  Si une carte n'est reliée à aucune autre, un message d'avertissement apparaît au retour. La carte isolée devient rouge pour être facile à repérer.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={S.infoCloseBtn} onPress={() => setInfoVisible(false)}>
              <Text style={S.infoCloseText}>J'ai compris</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={renameVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setRenameVisible(false)}>
          <Pressable style={S.modalCard}>
            <Text style={S.modalTitle}>Renommer le barème</Text>

            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nom du barème"
              placeholderTextColor="#94A3B8"
              style={S.input}
            />

            <TouchableOpacity style={S.primaryBtnFull} onPress={validerRenommerPage}>
              <Text style={S.primaryBtnText}>Valider</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {deleteNodeVisible && nodeToDelete && (
        <View style={S.deleteNodeBar} pointerEvents="auto">
          <View style={S.deleteNodeTextBox}>
            <Text style={S.deleteNodeTitle}>Supprimer cette carte ?</Text>
            <Text style={S.deleteNodeText}>
              La carte <Text style={{ color: DANGER, fontWeight: "900" }}>"{nodeToDelete.titre}"</Text> sera supprimée ainsi que tous les liens associés. Les liens concernés sont affichés en rouge.
            </Text>
          </View>

          <View style={S.deleteNodeActions}>
            <TouchableOpacity
              style={S.breakCancelBtn}
              onPress={() => {
                setDeleteNodeVisible(false);
                setNodeToDelete(null);
              }}
            >
              <Text style={S.breakCancelText}>Annuler</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.breakConfirmBtn} onPress={() => supprimerNoeud(nodeToDelete)}>
              <Text style={S.breakConfirmText}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={deleteConfirmVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setDeleteConfirmVisible(false)}>
          <Pressable style={S.modalCard}>
            <View style={S.modalDangerIcon}>
              <Feather name="trash-2" size={28} color={DANGER} />
            </View>

            <Text style={S.modalTitle}>Supprimer ce barème ?</Text>

            <Text style={S.modalText}>
              Le barème <Text style={{ color: DANGER, fontWeight: "900" }}>"{pageActive?.nom}"</Text> sera entièrement supprimé, y compris toutes ses cartes et tous ses liens. Cette action est irréversible.
            </Text>

            <View style={S.modalActions}>
              <TouchableOpacity style={S.secondaryBtn} onPress={() => setDeleteConfirmVisible(false)}>
                <Text style={S.secondaryBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={S.dangerBtn}
                onPress={() => {
                  setDeleteConfirmVisible(false);
                  supprimerPage();
                }}
              >
                <Feather name="trash-2" size={14} color="white" />
                <Text style={S.primaryBtnText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  topBar: {
    minHeight: 78,
    backgroundColor: HEADER_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  titleBox: {
    flex: 1,
  },

  titleMain: {
    color: HEADER_TITLE,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  titleSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  infoBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: HEADER_ICON_BG,
  },

  pagesBar: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: CONTENT_BG,
    borderBottomWidth: 1,
    borderBottomColor: CONTENT_BORDER,
  },

  pagesScroll: {
    alignItems: "center",
    gap: 8,
  },

  pageChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  pageChipActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },

  pageChipText: {
    color: CARD_TITLE,
    fontSize: 12,
    fontWeight: "900",
  },

  pageChipTextActive: {
    color: HEADER_TITLE,
  },

  pageAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: HEADER_BG,
  },

  pageActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  mobileToolsBar: {
    height: 72,
    maxHeight: 72,
    overflow: "hidden",
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: CONTENT_BORDER,
  },

  inlineHintBar: {
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: CONTENT_BORDER,
    backgroundColor: TEXT_BG,
  },

  inlineHintBarDesktop: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CONTENT_BORDER,
    backgroundColor: TEXT_BG,
  },

  inlineHintText: {
    color: HEADER_BG,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
  },

  mobileToolsHorizontalScroll: {
    height: 72,
    maxHeight: 72,
  },

  mobileToolsScroll: {
    height: 72,
    maxHeight: 72,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 6,
  },

  body: {
    flex: 1,
    flexDirection: "row",
    padding: 10,
    gap: 10,
    backgroundColor: CONTENT_BG,
  },

  toolsBar: {
    width: 78,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  toolBtn: {
    minWidth: 58,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "transparent",
  },

  toolBtnActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },

  toolIcon: {
    fontSize: 21,
    color: HEADER_BG,
  },

  toolIconSmall: {
    fontSize: 17,
    color: "#1F5B86",
  },

  toolIconActive: {
    color: HEADER_TITLE,
  },

  toolLabel: {
    color: "#1F5B86",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
  },

  toolLabelActive: {
    color: HEADER_TITLE,
    fontWeight: "900",
  },

  toolStats: {
    marginTop: "auto",
    alignItems: "center",
  },

  toolStatN: {
    color: HEADER_BG,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },

  toolStatL: {
    color: CARD_SUBTITLE,
    fontSize: 9,
    fontWeight: "800",
  },

  canvasWrap: {
    flex: 1,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
  },

  canvas: {
    position: "relative",
    backgroundColor: CONTENT_BG,
  },

  gridCell: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(31,91,134,0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  gridCellOccupied: {
    borderColor: "transparent",
  },

  gridCellAdd: {
    backgroundColor: "rgba(31,91,134,0.08)",
    borderColor: HEADER_BG,
    borderWidth: 2,
    zIndex: 15,
  },

  gridCellAddDanger: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: DANGER,
  },

  gridCellMove: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.45)",
    borderWidth: 2,
    zIndex: 15,
  },

  gridCellChosen: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderColor: SUCCESS,
    borderWidth: 3,
    shadowColor: SUCCESS,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },

  gridAddText: {
    color: HEADER_BG,
    fontSize: 28,
    fontWeight: "900",
  },

  gridAddTextDanger: {
    color: DANGER,
  },

  gridMoveText: {
    color: WARNING,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  deleteLinksSvg: {
    zIndex: 35,
    elevation: 35,
  },

  node: {
    position: "absolute",
    zIndex: 40,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  nodeSelected: {
    borderWidth: 3,
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  nodeMoveSource: {
    borderWidth: 3,
  },

  nodeLinkStart: {
    borderWidth: 3,
  },

  nodeDeleteTarget: {
    borderWidth: 4,
    shadowColor: DANGER,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },

  nodeUnlinkedWarning: {
    borderWidth: 4,
    shadowColor: DANGER,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },

  nodeContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  nodeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },

  nodeEmoji: {
    fontSize: 22,
  },

  nodeTitle: {
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  badge: {
    marginTop: 2,
    color: HEADER_TITLE,
    fontSize: 8,
    fontWeight: "900",
    backgroundColor: "rgba(15,23,42,0.35)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },

  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 16,
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.8)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 300,
  },

  toastText: {
    color: HEADER_TITLE,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  cutOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    zIndex: 100,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  cutOverlayText: {
    flex: 1,
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  cutCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },

  cutCancelText: {
    color: CARD_TITLE,
    fontWeight: "900",
  },

  cutConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: DANGER,
  },

  cutConfirmText: {
    color: HEADER_TITLE,
    fontWeight: "900",
  },

  blockingLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 500,
    backgroundColor: "rgba(15,23,42,0.08)",
    justifyContent: "flex-end",
    padding: 12,
  },

  deleteNodeBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 42,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    zIndex: 520,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  deleteNodeTextBox: {
    flex: 1,
  },

  deleteNodeTitle: {
    color: DANGER,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 3,
    textAlign: "center",
  },

  deleteNodeText: {
    color: CARD_TITLE,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center",
  },

  deleteNodeActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  breakWarningBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 72,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    zIndex: 540,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  breakWarningTextBox: {
    minHeight: 58,
    justifyContent: "center",
  },

  breakWarningTitle: {
    color: DANGER,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 3,
    textAlign: "center",
  },

  breakWarningText: {
    color: CARD_TITLE,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center",
  },

  breakWarningActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  breakCancelBtn: {
    flex: 1,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
  },

  breakCancelText: {
    color: CARD_TITLE,
    fontWeight: "900",
  },

  breakConfirmBtn: {
    flex: 1,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: DANGER,
    alignItems: "center",
  },

  breakConfirmText: {
    color: HEADER_TITLE,
    fontWeight: "900",
  },

  infoModalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  infoModalCard: {
    overflow: "hidden",
    width: "100%",
    maxWidth: 620,
    maxHeight: "86%",
    flexShrink: 1,
    borderRadius: 24,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
  },

  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  infoBigIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: TEXT_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  infoModalTitle: {
    color: CARD_TITLE,
    fontSize: 20,
    fontWeight: "900",
  },

  infoModalSubtitle: {
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 17,
  },

  infoScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
    gap: 10,
  },

  infoSection: {
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
  },

  infoSectionTitle: {
    color: HEADER_BG,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
  },

  infoText: {
    color: CARD_TITLE,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },

  infoIllustrationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  },

  infoLinkDemo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  infoMiniCardDashed: {
    width: 72,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TEXT_BG,
  },

  infoMiniPlus: {
    color: HEADER_BG,
    fontSize: 24,
    fontWeight: "900",
  },

  infoMiniCard: {
    width: 76,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniCardBlue: {
    width: 76,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: HEADER_ICON_BG,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniCardWarning: {
    width: 76,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FCA5A5",
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniEmoji: {
    fontSize: 18,
    marginBottom: 1,
  },

  infoMiniCardText: {
    color: HEADER_TITLE,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  infoMiniCardTextDark: {
    color: CARD_TITLE,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  infoGreenLine: {
    width: 72,
    height: 7,
    backgroundColor: SUCCESS,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#BBF7D0",
  },

  infoRedLine: {
    width: 72,
    height: 7,
    backgroundColor: DANGER,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#FCA5A5",
  },

  infoCloseBtn: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: HEADER_BG,
    paddingVertical: 13,
    alignItems: "center",
  },

  infoCloseText: {
    color: HEADER_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
  },

  modalTitle: {
    color: CARD_TITLE,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 10,
  },

  modalText: {
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },

  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  secondaryBtnText: {
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: DANGER,
  },

  modalDangerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  primaryBtnFull: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: HEADER_BG,
    paddingVertical: 13,
    alignItems: "center",
  },

  primaryBtnText: {
    color: HEADER_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  input: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: CARD_TITLE,
    fontWeight: "800",
    backgroundColor: "#F8FAFC",
  },
});
