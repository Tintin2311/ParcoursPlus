import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from "react-native";
import BottomBar from "./ui/BottomBar";

// Écrans
import AccueilProf from "./AccueilProf";
import GestionGroupes from "./GestionGroupes";
import GestionBalises from "./GestionBalises";
import GestionParcours from "./GestionParcours";
import GestionResultats from "./GestionResultats";

export type TabId =
  | "gestionGroupes"
  | "gestionBalises"
  | "accueil"
  | "gestionParcours"
  | "GestionPoints";

export type MainTabsProps = {
  initialTabId: TabId;
  onTabChange?: (id: TabId) => void;

  // Props relayées
  setPage: (p: string) => void;
  professeur: any;
  handleDeconnexion: () => Promise<void>;
  setProfesseur: (p: any) => void;
  setModeConnexion: (m: any) => void;
  setSelectedGroupUuid: (group: any) => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "gestionGroupes", label: "Groupes" },
  { id: "gestionBalises", label: "Balises" },
  { id: "accueil", label: "Accueil" },
  { id: "gestionParcours", label: "Parcours" },
  { id: "GestionPoints", label: "Barèmes" },
];

const idToIndex = (id: TabId) => TABS.findIndex((t) => t.id === id);
const clampIndex = (i: number) => Math.max(0, Math.min(TABS.length - 1, i));
const indexToId = (i: number) => TABS[clampIndex(i)].id;

const MainTabs: React.FC<MainTabsProps> = ({
  initialTabId,
  onTabChange,
  setPage,
  professeur,
  handleDeconnexion,
  setProfesseur,
  setModeConnexion,
  setSelectedGroupUuid,
}) => {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const scrollRef = useRef<ScrollView>(null);

  const initialIndex = (() => {
    const idx = idToIndex(initialTabId);
    return idx >= 0 ? idx : 2; // accueil
  })();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [pendingIndex, setPendingIndex] = useState(initialIndex);
  const [scrollProgress, setScrollProgress] = useState<number>(initialIndex); // 0..N-1 (continu)

  // Position initiale
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, y: 0, animated: false });
      setScrollProgress(initialIndex);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Navigate via BottomBar
  const goToIndex = useCallback(
    (index: number) => {
      if (!scrollRef.current) return;
      const clamped = clampIndex(index);
      setPendingIndex(clamped);
      // mise à jour immédiate de progress pour éviter tout “lag visuel”
      setScrollProgress(clamped);
      scrollRef.current.scrollTo({ x: clamped * width, animated: true });
    },
    [width]
  );

  // Suivi du scroll -> progress en temps réel
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const prog = Math.max(0, Math.min(TABS.length - 1, x / width));
      setScrollProgress(prog);
      const idx = Math.round(prog);
      if (idx !== pendingIndex) setPendingIndex(clampIndex(idx));
    },
    [width, pendingIndex]
  );

  // Fin d’inertie (mobile)
  const handleMomentumEnd = useCallback(() => {
    if (pendingIndex !== currentIndex) {
      setCurrentIndex(pendingIndex);
      onTabChange?.(indexToId(pendingIndex));
    }
  }, [pendingIndex, currentIndex, onTabChange]);

  // Web fallback
  const handleScrollEndDrag = useCallback(() => {
    if (isWeb && pendingIndex !== currentIndex) {
      setCurrentIndex(pendingIndex);
      onTabChange?.(indexToId(pendingIndex));
    }
  }, [isWeb, pendingIndex, currentIndex, onTabChange]);

  const handleNavigateFromBar = useCallback(
    (targetId: string) => {
      const idx = idToIndex(targetId as TabId);
      if (idx >= 0) goToIndex(idx);
    },
    [goToIndex]
  );

  const pages = useMemo(
    () => [
      <GestionGroupes
        key="gestionGroupes"
        setPage={setPage}
        professeur={professeur}
        setProfesseur={setProfesseur}
        setModeConnexion={setModeConnexion}
        setSelectedGroupUuid={setSelectedGroupUuid}
      />,
      <GestionBalises
        key="gestionBalises"
        setPage={setPage}
        professeur={professeur}
      />,
      <AccueilProf
        key="accueil"
        setPage={setPage}
        professeur={professeur}
        handleDeconnexion={handleDeconnexion}
      />,
      <GestionParcours key="gestionParcours" setPage={setPage} />,
      <GestionResultats key="GestionPoints" setPage={setPage} />,
    ],
    [
      setPage,
      professeur,
      handleDeconnexion,
      setProfesseur,
      setModeConnexion,
      setSelectedGroupUuid,
    ]
  );

  // Index “arrivé” pour les états non-animés
  const visualActiveIndex = Math.round(scrollProgress);

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1220" }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        horizontal
        pagingEnabled={!isWeb}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleScrollEndDrag}
        bounces={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        snapToInterval={isWeb ? width : undefined}
        snapToAlignment={isWeb ? "start" : undefined}
        decelerationRate={Platform.OS === "ios" ? "fast" : 0.985}
      >
        {pages.map((node, i) => (
          <View key={i} style={{ width, flex: 1 }}>
            {node}
          </View>
        ))}
      </ScrollView>

      <BottomBar
        // Pour sécurité, on garde l’ID courant (utile si jamais progress n’est pas fourni)
        currentPage={TABS[visualActiveIndex].id}
        onNavigate={handleNavigateFromBar}
        emitTabId
        // Suivi en temps réel (supprime tout décalage)
        scrollProgress={scrollProgress}
      />
    </View>
  );
};

export default MainTabs;
