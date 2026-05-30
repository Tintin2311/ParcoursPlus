import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  setPage?: (page: any) => void;
};

type Outil =
  | "selection"
  | "ajouter"
  | "deplacer"
  | "relier"
  | "ciseaux"
  | "conditions"
  | "supprimer";

type Noeud = {
  id: string;
  titre: string;
  ligne: number;
  colonne: number;
  color: string;
  conditionsActive?: boolean;
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
  conditionsDeblocage?: Record<string, any[]>;
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
const LOCK = HEADER_BG;

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

function nukeConditionIfUnlocked(
  oldConditions: Record<string, any[]>,
  nodeId: string,
  nextLockedState: boolean
) {
  if (nextLockedState) return oldConditions;

  const next = { ...oldConditions };
  delete next[nodeId];
  return next;
}

function createDefaultPage(): PageArbre {
  return {
    id: uid(),
    nom: "Barème 1",
    noeuds: [],
    liens: [],
    conditionsDeblocage: {},
  };
}

export default function CreationArbreDeCompetence({
  carte,
  onBack,
  onOpenCarte,
  setPage,
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

  const horizontalScrollRef = useRef<ScrollView | null>(null);
  const verticalScrollRef = useRef<ScrollView | null>(null);
  const lastScrollRef = useRef({ x: 0, y: 0 });
  const restoredRef = useRef(false);

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

  const pageActive = useMemo(
    () => pages.find((p) => p.id === pageId) || pages[0],
    [pages, pageId]
  );

  const noeuds = pageActive?.noeuds || [];
  const liens = pageActive?.liens || [];
  const conditionsDeblocage = pageActive?.conditionsDeblocage || {};

  const selectedNode = useMemo(
    () => noeuds.find((n) => n.id === selectedId) || noeuds[0] || null,
    [noeuds, selectedId]
  );

  const selectedNodeConditionsCount = selectedNode
    ? conditionsDeblocage[selectedNode.id]?.length || 0
    : 0;

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

    if (outil === "conditions") return "Clique sur une carte pour ajouter ou retirer le cadenas de conditions de déblocage";

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

  const showConditionsOverlay =
    outil === "conditions" &&
    !!selectedNode?.conditionsActive &&
    !isBlockingPromptOpen &&
    !breakWarningVisible &&
    !quitWarningVisible &&
    !deleteNodeVisible;

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!mounted) return;

        const g = globalThis as any;
        const wantsRestore =
          !!g.__arbrePendingRestore || !!g.__conditionsCarteReturnFromConditions;

        if (raw) {
          const data = JSON.parse(raw);

          if (Array.isArray(data?.pages) && data.pages.length > 0) {
            const fixedPages: PageArbre[] = data.pages.map((p: any) => ({
              ...p,
              liens: Array.isArray(p.liens) ? p.liens : [],
              conditionsDeblocage:
                p.conditionsDeblocage && typeof p.conditionsDeblocage === "object"
                  ? p.conditionsDeblocage
                  : {},
              noeuds:
                Array.isArray(p.noeuds) && p.noeuds.length > 0
                  ? p.noeuds
                  : createDefaultPage().noeuds,
            }));

            const restoredPageId =
              wantsRestore && g.__conditionsCartePageId
                ? g.__conditionsCartePageId
                : data.pageId || fixedPages[0].id;

            const restoredSelectedId =
              wantsRestore && g.__conditionsCarteSelectedId
                ? g.__conditionsCarteSelectedId
                : data.selectedId || fixedPages[0]?.noeuds?.[0]?.id || "";

            setPages(fixedPages);
            setPageId(restoredPageId);
            setSelectedId(restoredSelectedId);
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

  useEffect(() => {
    if (!loadedRef.current || restoredRef.current) return;

    const g = globalThis as any;
    const wantsRestore =
      !!g.__arbrePendingRestore || !!g.__conditionsCarteReturnFromConditions;

    if (!wantsRestore) return;

    restoredRef.current = true;

    const restoreX = Number(g.__arbreScrollX || 0);
    const restoreY = Number(g.__arbreScrollY || 0);
    const restorePageId = g.__conditionsCartePageId || pageId;
    const restoreSelectedId = g.__conditionsCarteSelectedId || selectedId;

    if (restorePageId && restorePageId !== pageId) {
      setPageId(restorePageId);
    }

    if (restoreSelectedId && restoreSelectedId !== selectedId) {
      setSelectedId(restoreSelectedId);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        horizontalScrollRef.current?.scrollTo({
          x: restoreX,
          y: 0,
          animated: false,
        });

        verticalScrollRef.current?.scrollTo({
          x: 0,
          y: restoreY,
          animated: false,
        });

        lastScrollRef.current = { x: restoreX, y: restoreY };

        g.__arbrePendingRestore = false;
        g.__conditionsCarteReturnFromConditions = false;
      }, 80);
    });
  }, [canvasH, canvasW, pageId, selectedId]);

  const saveTreeReturnState = (nodeId?: string) => {
    const g = globalThis as any;

    g.__arbreScrollX = lastScrollRef.current.x;
    g.__arbreScrollY = lastScrollRef.current.y;
    g.__conditionsCarteSelectedId = nodeId || selectedId || null;
    g.__conditionsCartePageId = pageActive?.id || pageId || null;
    g.__conditionsCarteStorageKey = storageKey;
    g.__arbrePendingRestore = true;
  };

  const handleHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastScrollRef.current.x = event.nativeEvent.contentOffset.x;
  };

  const handleVerticalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastScrollRef.current.y = event.nativeEvent.contentOffset.y;
  };

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

    if (outil === "conditions") {
      setSelectedId(node.id);

      // Si la carte n'a pas encore de cadenas : on ajoute le cadenas.
      if (!node.conditionsActive) {
        toggleConditionsForNode(node);
        return;
      }

      // Si la carte a déjà un cadenas : on ne le retire pas ici.
      // L'overlay s'affiche et le bouton "Débloquer" devient le seul moyen de retirer le cadenas.
      return;
    }

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
      conditionsDeblocage: nukeConditionIfUnlocked(
        p.conditionsDeblocage || {},
        node.id,
        false
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

  const toggleConditionsForNode = (node: Noeud) => {
    setSelectedId(node.id);

    updateCurrentPage((p) => ({
      ...p,
      noeuds: p.noeuds.map((n) =>
        n.id === node.id
          ? { ...n, conditionsActive: !n.conditionsActive }
          : n
      ),
      conditionsDeblocage: nukeConditionIfUnlocked(
        p.conditionsDeblocage || {},
        node.id,
        !node.conditionsActive
      ),
    }));
  };

  const ouvrirConditionsCarte = (node: Noeud) => {
    setSelectedId(node.id);
    saveTreeReturnState(node.id);

    (globalThis as any).__conditionsCarteNode = {
      ...node,
      nom: node.titre,
      arbre_page_id: pageActive?.id,
      arbre_page_nom: pageActive?.nom,
      carte_parent: carte,
    };
    (globalThis as any).__conditionsCarteCarteParent = carte;
    (globalThis as any).__conditionsCartePageActive = pageActive;
    (globalThis as any).__conditionsCartePages = pages;
    (globalThis as any).__conditionsCarteStorageKey = storageKey;
    (globalThis as any).__conditionsCarteReturnFromConditions = false;

    setPage?.("ConditionsDeblocageCarte");
  };

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
          ["conditions", "lock", "Conditions", LOCK],
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
            ref={horizontalScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: canvasW }}
            scrollEnabled={canScrollCanvas}
            onScroll={handleHorizontalScroll}
            scrollEventThrottle={16}
          >
            <ScrollView
              ref={verticalScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: canvasW, height: canvasH }}
              scrollEnabled={canScrollCanvas}
              onScroll={handleVerticalScroll}
              scrollEventThrottle={16}
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
                  const isLocked = !!node.conditionsActive;
                  const nodeConditionsCount = conditionsDeblocage[node.id]?.length || 0;

                  const bgColor = isMoveSource
                    ? WARNING
                    : isLinkStart
                    ? SUCCESS
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
                    : isLocked
                    ? LOCK
                    : CARD_BORDER;

                  const textColor = isMoveSource || isLinkStart || isUnlinkedWarning ? HEADER_TITLE : CARD_TITLE;

                  return (
                    <Pressable
                      key={node.id}
                      pointerEvents="auto"
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
                        selected && isLocked && S.nodeSelectedLocked,
                        isMoveSource && S.nodeMoveSource,
                        isLinkStart && S.nodeLinkStart,
                        isDeleteTarget && S.nodeDeleteTarget,
                        isUnlinkedWarning && S.nodeUnlinkedWarning,
                        isLocked && S.nodeLocked,
                      ]}
                    >
                      <LinearGradient
                        colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0)"]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />

                      {isLocked && (
                        <View pointerEvents="none" style={S.lockCenter}>
                          <Feather name="lock" size={isPhone ? 23 : 32} color="rgba(255,255,255,0.96)" />
                        </View>
                      )}

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

      {showConditionsOverlay && selectedNode && (
        <View pointerEvents="box-none" style={S.conditionsBottomOverlay}>
          <View style={S.conditionsBottomCard}>
            <View style={S.conditionsBottomTextBox}>
              <Text style={S.conditionsBottomTitle} numberOfLines={1}>
                {selectedNode.titre}
              </Text>
            </View>

            <View style={S.conditionsBottomButtons}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={S.unlockButton}
                onPress={() => {
                  updateCurrentPage((p) => ({
                    ...p,
                    noeuds: p.noeuds.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, conditionsActive: false }
                        : n
                    ),
                    conditionsDeblocage: nukeConditionIfUnlocked(
                      p.conditionsDeblocage || {},
                      selectedNode.id,
                      false
                    ),
                  }));
                }}
              >
                <View style={S.unlockButtonContent}>
                  <Feather
                    name="unlock"
                    size={14}
                    color={DANGER}
                  />

                  <Text style={S.unlockButtonText}>
                    Débloquer
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={S.conditionsButton}
                onPress={() => ouvrirConditionsCarte(selectedNode)}
              >
                <Text style={S.conditionsButtonText}>{`Conditions
de déblocage`}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
                <Text style={S.infoSectionTitle}>5. Cadenas et conditions de déblocage</Text>
                <Text style={S.infoText}>
                  L'outil Cadenas permet de verrouiller une carte. Une étiquette apparaît sur la carte : clique dessus pour choisir les conditions à partir d'une carte reliée.
                </Text>
              </View>

              <View style={S.infoSection}>
                <Text style={S.infoSectionTitle}>6. Avant de quitter</Text>
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
    width: 90,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  toolBtn: {
    minWidth: 60,
    paddingHorizontal: 5,
    paddingVertical: 5,
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
    fontSize: 7,
    fontWeight: "900",
    textAlign: "center",
  },

  toolLabelActive: {
    color: HEADER_TITLE,
    fontWeight: "900",
  },

  toolStats: {
    marginTop: 8,
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
    zIndex: 1,
    elevation: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(31,91,134,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  gridCellOccupied: {
    opacity: 0,
  },

  gridCellAdd: {
    borderColor: "rgba(34,197,94,0.28)",
    backgroundColor: "rgba(34,197,94,0.04)",
  },

  gridCellAddDanger: {
    borderColor: "rgba(239,68,68,0.48)",
    backgroundColor: "rgba(239,68,68,0.05)",
  },

  gridCellMove: {
    borderColor: "rgba(245,158,11,0.38)",
    backgroundColor: "rgba(245,158,11,0.05)",
  },

  gridCellChosen: {
    borderColor: WARNING,
    backgroundColor: "rgba(245,158,11,0.12)",
  },

  gridAddText: {
    color: SUCCESS,
    fontSize: 24,
    fontWeight: "900",
  },

  gridAddTextDanger: {
    color: DANGER,
  },

  gridMoveText: {
    color: WARNING,
    fontSize: 12,
    fontWeight: "900",
  },

  node: {
    position: "absolute",
    zIndex: 50,
    elevation: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
  },

  nodeSelected: {
    borderWidth: 4,
    shadowOpacity: 0.20,
    shadowRadius: 14,
  },

  nodeSelectedLocked: {
    borderWidth: 5,
    borderColor: HEADER_BG,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    transform: [{ scale: 1.03 }],
  },

  nodeMoveSource: {
    borderWidth: 3,
  },

  nodeLinkStart: {
    borderWidth: 3,
  },

  nodeDeleteTarget: {
    borderWidth: 3,
  },

  nodeUnlinkedWarning: {
    borderWidth: 3,
    borderColor: "#FCA5A5",
  },

  nodeLocked: {
    borderWidth: 3,
    borderColor: LOCK,
  },

  nodeContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    zIndex: 50,
  },

  nodeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 6,
  },

  nodeEmoji: {
    fontSize: 20,
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

  lockCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 55,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(76,29,149,0.28)",
  },

  conditionsMiniPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    zIndex: 70,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: LOCK,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },

  conditionsMiniPillText: {
    color: HEADER_TITLE,
    fontSize: 10,
    fontWeight: "900",
  },

  conditionsBottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 30,
    elevation: 30,
  },

  conditionsBottomCard: {
    pointerEvents: "auto",
    width: "100%",
    maxWidth: 760,
    minHeight: 86,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  conditionsBottomIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  conditionsBottomTextBox: {
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  conditionsBottomTitle: {
    color: HEADER_BG,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "center",
  },

  conditionsBottomButtons: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  unlockButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.40)",
    alignItems: "center",
    justifyContent: "center",
  },

  unlockButtonText: {
    color: DANGER,
    fontWeight: "900",
    fontSize: 12,
  },

  unlockButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  conditionsButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  conditionsButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 13,
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
    paddingVertical: 10,
    zIndex: 120,
  },

  toastText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  cutOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: CONTENT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 90,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  cutOverlayText: {
    flex: 1,
    color: CARD_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },

  cutCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: TEXT_BG,
  },

  cutCancelText: {
    color: HEADER_BG,
    fontSize: 12,
    fontWeight: "900",
  },

  cutConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: DANGER,
  },

  cutConfirmText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
  },

  blockingLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: "flex-end",
  },

  breakWarningBar: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  breakWarningTextBox: {
    flex: 1,
  },

  breakWarningTitle: {
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  breakWarningText: {
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  breakWarningActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  breakCancelBtn: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: TEXT_BG,
  },

  breakCancelText: {
    color: HEADER_BG,
    fontSize: 12,
    fontWeight: "900",
  },

  breakConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: DANGER,
  },

  breakConfirmText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
  },

  deleteLinksSvg: {
    zIndex: 85,
  },

  deleteNodeBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 110,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  deleteNodeTextBox: {
    flex: 1,
  },

  deleteNodeTitle: {
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "900",
  },

  deleteNodeText: {
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  deleteNodeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "white",
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  modalTitle: {
    color: CARD_TITLE,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  modalText: {
    color: CARD_SUBTITLE,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 10,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  modalDangerIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "rgba(239,68,68,0.10)",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  input: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: TEXT_BG,
    borderWidth: 1,
    borderColor: CONTENT_BORDER,
    paddingHorizontal: 14,
    color: CARD_TITLE,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 16,
  },

  primaryBtnFull: {
    marginTop: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "900",
  },

  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    backgroundColor: TEXT_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryBtnText: {
    color: HEADER_BG,
    fontSize: 13,
    fontWeight: "900",
  },

  dangerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  infoModalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.46)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  infoModalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    borderRadius: 26,
    backgroundColor: "white",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: CONTENT_BORDER,
  },

  infoBigIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: TEXT_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  infoModalTitle: {
    color: CARD_TITLE,
    fontSize: 17,
    fontWeight: "900",
  },

  infoModalSubtitle: {
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },

  infoScrollContent: {
    paddingVertical: 12,
    gap: 12,
  },

  infoSection: {
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONTENT_BORDER,
    padding: 12,
  },

  infoSectionTitle: {
    color: HEADER_BG,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
  },

  infoText: {
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },

  infoIllustrationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  infoMiniCardDashed: {
    width: 68,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(31,91,134,0.28)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31,91,134,0.04)",
  },

  infoMiniPlus: {
    color: HEADER_BG,
    fontSize: 22,
    fontWeight: "900",
  },

  infoMiniCardBlue: {
    width: 72,
    height: 52,
    borderRadius: 16,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniEmoji: {
    fontSize: 18,
  },

  infoMiniCardText: {
    color: "white",
    fontSize: 10,
    fontWeight: "900",
  },

  infoLinkDemo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  infoMiniCard: {
    width: 70,
    height: 44,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniCardWarning: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },

  infoMiniCardTextDark: {
    color: CARD_TITLE,
    fontSize: 10,
    fontWeight: "900",
  },

  infoGreenLine: {
    height: 5,
    width: 70,
    backgroundColor: SUCCESS,
  },

  infoRedLine: {
    height: 5,
    width: 70,
    backgroundColor: DANGER,
  },

  infoCloseBtn: {
    height: 48,
    borderRadius: 17,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  infoCloseText: {
    color: "white",
    fontSize: 13,
    fontWeight: "900",
  },
});
