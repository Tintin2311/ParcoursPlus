import React, { useEffect, useMemo, useState } from "react";
import {
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Noeud = {
  id: string;
  titre?: string;
  nom?: string;
  ligne?: number;
  colonne?: number;
  color?: string;
  arbre_page_id?: string;
  arbre_page_nom?: string;
  [key: string]: any;
};

type Lien = {
  id: string;
  from: string;
  to: string;
};

type ConditionType =
  | "terminer_x_parcours"
  | "reussir_x_parcours_tentatives"
  | "pourcentage_avancement";

type OperateurGeneral = "ET" | "OU";

type ConditionCarte = {
  id: string;
  sourceCardId: string;
  type: ConditionType;
  label: string;
  valeur?: string;
  extra?: {
    nbParcours?: string;
    nbTentatives?: string;
    pourcentage?: string;
  };
};

type ConditionGenerale = {
  operateur: OperateurGeneral;
  score: string;
};

type PageArbre = {
  id: string;
  nom: string;
  noeuds: Noeud[];
  liens: Lien[];
  conditionsDeblocage?: Record<string, ConditionCarte[]>;
  conditionsGenerales?: Record<string, ConditionGenerale>;
};

type Props = {
  carteCible?: Noeud | null;
  carteParent?: any;
  pageActive?: PageArbre | null;
  pages?: PageArbre[] | null;
  onBack?: () => void;
  onSave?: (conditions: ConditionCarte[]) => void;
  setPage?: (page: any) => void;
};

const BACKGROUND_URL =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/CartesCompetences/FondBleuCarte.png";

const PAGE_BG = "#EEF3F7";
const HEADER_BG = "#101722";
const HEADER_ICON_BG = "rgba(255,255,255,0.12)";
const HEADER_TITLE = "#FFFFFF";
const BLUE = "#1F5B86";
const BLUE_DARK = "#15466D";
const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#D2DEE8";
const CARD_TITLE = "#203348";
const CARD_SUBTITLE = "#667A8E";
const TEXT_BG = "#E8F1FD";
const SUCCESS = "#55CF59";
const DANGER = "#EF4444";
const PURPLE = "#7C3AED";

const CONDITION_OPTIONS: {
  type: ConditionType;
  title: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    type: "terminer_x_parcours",
    title: "Terminer au moins X parcours",
    icon: "check-circle",
  },
  {
    type: "reussir_x_parcours_tentatives",
    title: "Réussir X parcours en X tentatives",
    icon: "shuffle",
  },
  {
    type: "pourcentage_avancement",
    title: "Atteindre X % d'avancement",
    icon: "bar-chart-2",
  },
];

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function getGlobalData() {
  const g = globalThis as any;

  return {
    carteCible: g.__conditionsCarteNode as Noeud | undefined,
    carteParent: g.__conditionsCarteCarteParent,
    pageActive: g.__conditionsCartePageActive as PageArbre | undefined,
    pages: g.__conditionsCartePages as PageArbre[] | undefined,
    storageKey: g.__conditionsCarteStorageKey as string | undefined,
  };
}

function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function getCardTitle(card?: Noeud | null) {
  return card?.titre || card?.nom || "Carte";
}

function conditionLabel(
  type: ConditionType,
  values: { nbParcours?: string; nbTentatives?: string; pourcentage?: string }
) {
  if (type === "terminer_x_parcours") {
    return `Réussir ${values.nbParcours || "0"} parcours`;
  }

  if (type === "reussir_x_parcours_tentatives") {
    return `Réussir ${values.nbParcours || "0"} parcours en ${
      values.nbTentatives || "0"
    } tentative${values.nbTentatives === "1" ? "" : "s"} max`;
  }

  if (type === "pourcentage_avancement") {
    return `Atteindre ${values.pourcentage || "0"}% d'avancement`;
  }

  return "Condition";
}

function ConditionsDeblocageCarte({
  carteCible: carteCibleProp,
  carteParent: carteParentProp,
  pageActive: pageActiveProp,
  pages: pagesProp,
  onBack,
  onSave,
  setPage,
}: Props) {
  const { width, height } = useWindowDimensions();

  const isPhone = width < 760;
  const isTinyPhone = width < 390 || height < 740;
  const isCompactHeight = height < 820;
  const isVeryCompactHeight = height < 700;

  const topBarHeight = isPhone ? 56 : 72;
  const outerPadding = isPhone ? 6 : 12;
  const panelHeight = Math.max(
    isPhone ? 430 : 560,
    height - topBarHeight - outerPadding * 2 - 4
  );

  const panelWidth = Math.min(width - outerPadding * 2, 1040);
  const titleZoneHeight = isPhone ? 46 : 62;
  const scoreZoneHeight = isPhone ? 44 : 52;
  const operatorZoneHeight = isPhone ? 42 : 52;
  const verticalGaps = isPhone ? 44 : 72;
  const availableDeckHeight = Math.max(
    isPhone ? 230 : 320,
    panelHeight - titleZoneHeight - scoreZoneHeight - operatorZoneHeight - verticalGaps
  );
  const unlockCardHeight = Math.max(
    isPhone ? 230 : 320,
    Math.min(availableDeckHeight, isPhone ? 330 : 440)
  );
  const unlockCardWidth = isPhone
    ? Math.min(235, Math.max(190, width * 0.58))
    : Math.min(280, Math.max(235, panelWidth * 0.26));
  const conditionScrollMaxHeight = Math.max(
    isPhone ? 95 : 145,
    unlockCardHeight - (isPhone ? 118 : 150)
  );

  const globalData = getGlobalData();

  const carteCible = carteCibleProp || globalData.carteCible || null;
  const carteParent =
    carteParentProp || globalData.carteParent || carteCible?.carte_parent || null;

  const initialPageActive = pageActiveProp || globalData.pageActive || null;
  const initialPages = ensureArray(pagesProp || globalData.pages || []);

  const storageKey =
    globalData.storageKey || `arbre_competence_${carteParent?.id || "default"}`;

  const [localPages, setLocalPages] = useState<PageArbre[]>(initialPages);
  const [localPageId, setLocalPageId] = useState(
    initialPageActive?.id || carteCible?.arbre_page_id || ""
  );
  const [cardName, setCardName] = useState(getCardTitle(carteCible));
  const [conditions, setConditions] = useState<ConditionCarte[]>([]);
  const [conditionGenerale, setConditionGenerale] = useState<ConditionGenerale>({
    operateur: "OU",
    score: "0",
  });

  const [infoVisible, setInfoVisible] = useState(false);
  const [conditionModalVisible, setConditionModalVisible] = useState(false);
  const [selectedCardForModal, setSelectedCardForModal] = useState<string | null>(
    null
  );
  const [selectedConditionType, setSelectedConditionType] =
    useState<ConditionType>("terminer_x_parcours");

  const [nbParcours, setNbParcours] = useState("1");
  const [nbTentatives, setNbTentatives] = useState("2");
  const [pourcentage, setPourcentage] = useState("90");
  const [deleteConditionId, setDeleteConditionId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const currentPage = useMemo(() => {
    return (
      localPages.find((p) => p.id === localPageId) ||
      initialPageActive ||
      localPages[0] ||
      null
    );
  }, [localPages, localPageId, initialPageActive]);

  const noeuds = currentPage?.noeuds || [];
  const liens = currentPage?.liens || [];

  const cartesReliees = useMemo(() => {
    if (!carteCible?.id) return [];

    return noeuds.filter((n) =>
      liens.some(
        (l) =>
          (l.from === carteCible.id && l.to === n.id) ||
          (l.to === carteCible.id && l.from === n.id)
      )
    );
  }, [noeuds, liens, carteCible?.id]);

  useEffect(() => {
    setCardName(getCardTitle(carteCible));
  }, [carteCible?.id]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!carteCible?.id) return;

      const directPages = ensureArray(pagesProp || globalData.pages || []);
      const directPage = pageActiveProp || globalData.pageActive || null;

      if (directPage && directPages.length > 0) {
        if (!mounted) return;

        setLocalPages(directPages);
        setLocalPageId(directPage.id);
        setConditions(directPage.conditionsDeblocage?.[carteCible.id] || []);
        setConditionGenerale(
          directPage.conditionsGenerales?.[carteCible.id] || {
            operateur: "OU",
            score: "0",
          }
        );
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!mounted || !raw) return;

        const data = JSON.parse(raw);
        const fixedPages: PageArbre[] = Array.isArray(data?.pages)
          ? data.pages
          : [];

        const fixedPageId =
          carteCible.arbre_page_id || data?.pageId || fixedPages[0]?.id || "";

        const fixedPage =
          fixedPages.find((p) => p.id === fixedPageId) || fixedPages[0] || null;

        setLocalPages(fixedPages);
        setLocalPageId(fixedPage?.id || "");
        setConditions(fixedPage?.conditionsDeblocage?.[carteCible.id] || []);
        setConditionGenerale(
          fixedPage?.conditionsGenerales?.[carteCible.id] || {
            operateur: "OU",
            score: "0",
          }
        );
      } catch {
        showToast("Impossible de charger les conditions.");
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [
    carteCible?.id,
    carteCible?.arbre_page_id,
    pageActiveProp,
    pagesProp,
    storageKey,
  ]);

  function showToast(message: string, duration = 1600) {
    setToast(message);
    setTimeout(() => setToast(""), duration);
  }

  async function persistPage(update: (page: PageArbre) => PageArbre) {
    if (!carteCible?.id) return;

    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : { pages: localPages, pageId: localPageId };
      const oldPages: PageArbre[] = Array.isArray(data?.pages)
        ? data.pages
        : localPages;

      const nextPages = oldPages.map((p) => {
        if (p.id !== currentPage?.id) return p;
        return update(p);
      });

      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          ...data,
          pages: nextPages,
          pageId: currentPage?.id || localPageId,
          selectedId: carteCible.id,
        })
      );

      setLocalPages(nextPages);

      const updatedCurrentPage = nextPages.find(
        (p) => p.id === (currentPage?.id || localPageId)
      );

      const g = globalThis as any;
      g.__conditionsCartePages = nextPages;
      g.__conditionsCartePageActive = updatedCurrentPage;
    } catch {
      showToast("Enregistrement impossible.");
    }
  }

  async function persistConditions(next: ConditionCarte[]) {
    if (!carteCible?.id) return;

    setConditions(next);
    onSave?.(next);

    await persistPage((p) => ({
      ...p,
      conditionsDeblocage: {
        ...(p.conditionsDeblocage || {}),
        [carteCible.id]: next,
      },
    }));
  }

  async function changerConditionGenerale(next: ConditionGenerale) {
    if (!carteCible?.id) return;

    setConditionGenerale(next);

    await persistPage((p) => ({
      ...p,
      conditionsGenerales: {
        ...(p.conditionsGenerales || {}),
        [carteCible.id]: next,
      },
    }));
  }

  function openConditionModalForCard(cardId: string) {
    setSelectedCardForModal(cardId);
    setConditionModalVisible(true);
  }

  async function ajouterCondition() {
    if (!selectedCardForModal) {
      showToast("Choisis une carte.");
      return;
    }

    const values = {
      nbParcours: nbParcours.trim(),
      nbTentatives: nbTentatives.trim(),
      pourcentage: pourcentage.trim(),
    };

    if (selectedConditionType === "terminer_x_parcours" && !values.nbParcours) {
      showToast("Indique le nombre de parcours.");
      return;
    }

    if (
      selectedConditionType === "reussir_x_parcours_tentatives" &&
      (!values.nbParcours || !values.nbTentatives)
    ) {
      showToast("Indique parcours et tentatives.");
      return;
    }

    if (selectedConditionType === "pourcentage_avancement" && !values.pourcentage) {
      showToast("Indique le pourcentage.");
      return;
    }

    const newCondition: ConditionCarte = {
      id: uid(),
      sourceCardId: selectedCardForModal,
      type: selectedConditionType,
      label: conditionLabel(selectedConditionType, values),
      valeur:
        selectedConditionType === "pourcentage_avancement"
          ? values.pourcentage
          : values.nbParcours,
      extra: values,
    };

    await persistConditions([...conditions, newCondition]);
    setConditionModalVisible(false);
    showToast("Condition ajoutée.");
  }

  async function supprimerCondition(id: string) {
    const next = conditions.filter((c) => c.id !== id);
    setDeleteConditionId(null);
    await persistConditions(next);
  }

  function handleBack() {
  const g = globalThis as any;

  g.__arbrePendingRestore = true;
  g.__conditionsCarteReturnFromConditions = true;
  g.__conditionsCarteSelectedId = carteCible?.id || null;
  g.__conditionsCartePageId = currentPage?.id || localPageId || null;

  if (setPage) {
    setPage("CreationArbreDeCompetence");
    return;
  }

  onBack?.();
}

  if (!carteCible?.id) {
    return (
      <SafeAreaView style={S.safe}>
        <View style={[S.topBar, isPhone && S.topBarPhone]}>
          <TouchableOpacity
            onPress={handleBack}
            style={[S.backBtn, isPhone && S.headerBtnPhone]}
            activeOpacity={0.9}
          >
            <Feather name="arrow-left" size={isPhone ? 18 : 20} color={HEADER_TITLE} />
          </TouchableOpacity>

          <View style={S.titleBox}>
            <Text style={[S.titleMain, isPhone && S.titleMainPhone]}>
              Conditions de déblocage
            </Text>
            <Text style={[S.titleSub, isPhone && S.titleSubPhone]}>
              Aucune carte sélectionnée
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <View style={[S.topBar, isPhone && S.topBarPhone]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[S.backBtn, isPhone && S.headerBtnPhone]}
          activeOpacity={0.9}
        >
          <Feather name="arrow-left" size={isPhone ? 18 : 20} color={HEADER_TITLE} />
        </TouchableOpacity>

        <View style={S.titleBox}>
          <Text style={[S.titleMain, isPhone && S.titleMainPhone]} numberOfLines={1}>
            Conditions de déblocage
          </Text>
          
        </View>

        <TouchableOpacity
          style={[S.infoTopIcon, isPhone && S.headerBtnPhone]}
          onPress={() => setInfoVisible(true)}
          activeOpacity={0.9}
        >
          <Feather name="info" size={isPhone ? 17 : 19} color={HEADER_TITLE} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={S.pageScroll}
        contentContainerStyle={[
          S.pageContent,
          isPhone && S.pageContentPhone,
          { minHeight: height - topBarHeight },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={false}
      >
        <ImageBackground
          source={{ uri: BACKGROUND_URL }}
          resizeMode="stretch"
          imageStyle={[S.bgImageStyle, isPhone && S.bgImageStylePhone]}
          style={[
            S.mainPanel,
            isPhone && S.mainPanelPhone,
            isCompactHeight && S.mainPanelCompactHeight,
            { height: panelHeight, width: panelWidth },
          ]}
        >
          <View
            style={[
              S.nameRow,
              isPhone && S.nameRowPhone,
              isCompactHeight && S.nameRowCompact,
              isVeryCompactHeight && S.nameRowVeryCompact,
            ]}
          >
            <TextInput
              value={cardName}
              onChangeText={setCardName}
              placeholder="Nom de la carte"
              placeholderTextColor="rgba(15,23,42,0.55)"
              style={[
                S.cardNameInput,
                isPhone && S.cardNameInputPhone,
                isCompactHeight && S.cardNameInputCompact,
                isVeryCompactHeight && S.cardNameInputVeryCompact,
              ]}
              numberOfLines={1}
              textAlign="center"
            />
          </View>

          <View
            style={[
              S.scoreRow,
              isPhone && S.scoreRowPhone,
              isCompactHeight && S.scoreRowCompact,
              isVeryCompactHeight && S.scoreRowVeryCompact,
            ]}
          >
            <View style={[S.scoreLabelBox, isPhone && S.scoreLabelBoxPhone]}>
              <Feather
                name="award"
                size={isPhone ? 16 : 22}
                color={CARD_SUBTITLE}
              />
              <Text
                style={[S.scorePlaceholder, isPhone && S.scorePlaceholderPhone]}
                numberOfLines={1}
              >
                Score à atteindre
              </Text>
            </View>

            <TextInput
              value={conditionGenerale.score}
              onChangeText={(score) =>
                changerConditionGenerale({ ...conditionGenerale, score })
              }
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              style={[S.scoreInput, isPhone && S.scoreInputPhone]}
            />
          </View>

          <View
            style={[
              S.operatorBridgeRow,
              isPhone && S.operatorBridgeRowPhone,
              isCompactHeight && S.operatorBridgeRowCompact,
              isVeryCompactHeight && S.operatorBridgeRowVeryCompact,
            ]}
          >
            <View style={S.bridgeLine} />

            <View style={[S.operatorSegment, isPhone && S.operatorSegmentPhone]}>
              {(["ET", "OU"] as OperateurGeneral[]).map((op) => {
                const active = conditionGenerale.operateur === op;

                return (
                  <TouchableOpacity
                    key={op}
                    style={[
                      S.operatorSegmentBtn,
                      active && S.operatorSegmentBtnActive,
                    ]}
                    onPress={() =>
                      changerConditionGenerale({ ...conditionGenerale, operateur: op })
                    }
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        S.operatorSegmentText,
                        isPhone && S.operatorSegmentTextPhone,
                        active && S.operatorSegmentTextActive,
                      ]}
                    >
                      {op}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={S.bridgeLine} />
          </View>

          <View
            style={[
              S.deckZone,
              isPhone && S.deckZonePhone,
              isCompactHeight && S.deckZoneCompact,
              isVeryCompactHeight && S.deckZoneVeryCompact,
              { height: availableDeckHeight },
            ]}
          >
            {cartesReliees.length === 0 ? (
              <View style={[
                  S.emptyDeck,
                  isPhone && S.emptyDeckPhone,
                  isCompactHeight && S.emptyDeckCompact,
                ]}>
                <Text style={S.emptyDeckText}>Aucune carte reliée.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  S.deckScrollContent,
                  isPhone && S.deckScrollContentPhone,
                  isCompactHeight && S.deckScrollContentCompact,
                  cartesReliees.length <= 3 && { flexGrow: 1, justifyContent: "center" },
                ]}
              >
                {cartesReliees.map((card, index) => {
                  const cardConditions = conditions.filter(
                    (condition) => condition.sourceCardId === card.id
                  );

                  const iconName: keyof typeof Feather.glyphMap =
                    index % 4 === 0
                      ? "flag"
                      : index % 4 === 1
                        ? "award"
                        : index % 4 === 2
                          ? "map"
                          : "lock";

                  return (
                    <View
                      key={card.id}
                      style={[
                        S.unlockCard,
                        isPhone && S.unlockCardPhone,
                        isCompactHeight && S.unlockCardCompact,
                        isVeryCompactHeight && S.unlockCardVeryCompact,
                        { width: unlockCardWidth, height: unlockCardHeight },
                      ]}
                    >
                      <View
                        style={[
                          S.unlockHeader,
                          isPhone && S.unlockHeaderPhone,
                          isCompactHeight && S.unlockHeaderCompact,
                          isVeryCompactHeight && S.unlockHeaderVeryCompact,
                        ]}
                      >
                        <View
                          style={[
                            S.unlockIconCircle,
                            isPhone && S.unlockIconCirclePhone,
                          ]}
                        >
                          <Feather
                            name={iconName}
                            size={isPhone ? 16 : 22}
                            color={BLUE_DARK}
                          />
                        </View>

                        <Text
                          style={[
                            S.unlockCardTitle,
                            isPhone && S.unlockCardTitlePhone,
                          ]}
                          numberOfLines={1}
                        >
                          {getCardTitle(card)}
                        </Text>

                        <View style={[S.greenDot, isPhone && S.greenDotPhone]} />
                      </View>

                      <View style={[
                          S.unlockBody,
                          isPhone && S.unlockBodyPhone,
                          isCompactHeight && S.unlockBodyCompact,
                        ]}>
                        {cardConditions.length === 0 ? (
                          <View
                            style={[
                              S.emptyConditionSpace,
                              isPhone && S.emptyConditionSpacePhone,
                            ]}
                          />
                        ) : (
                          <ScrollView
                            style={{ maxHeight: conditionScrollMaxHeight }}
                            showsVerticalScrollIndicator={false}
                            nestedScrollEnabled
                          >
                            {cardConditions.map((condition) => (
                              <View
                                key={condition.id}
                                style={[
                                  S.conditionPill,
                                  isPhone && S.conditionPillPhone,
                                ]}
                              >
                                <Feather
                                  name={
                                    condition.type === "pourcentage_avancement"
                                      ? "bar-chart-2"
                                      : condition.type === "terminer_x_parcours"
                                        ? "check-circle"
                                        : "shuffle"
                                  }
                                  size={isPhone ? 13 : 16}
                                  color={
                                    condition.type === "pourcentage_avancement"
                                      ? PURPLE
                                      : condition.type === "terminer_x_parcours"
                                        ? SUCCESS
                                        : CARD_SUBTITLE
                                  }
                                />

                                <Text
                                  style={[
                                    S.conditionPillText,
                                    isPhone && S.conditionPillTextPhone,
                                  ]}
                                  numberOfLines={isPhone ? 2 : 3}
                                >
                                  {condition.label}
                                </Text>

                                <TouchableOpacity
                                  style={[
                                    S.deletePillBtn,
                                    isPhone && S.deletePillBtnPhone,
                                  ]}
                                  onPress={() => setDeleteConditionId(condition.id)}
                                >
                                  <Feather
                                    name="x"
                                    size={isPhone ? 10 : 12}
                                    color={DANGER}
                                  />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </ScrollView>
                        )}

                        <TouchableOpacity
                          style={[
                            S.addConditionPill,
                            isPhone && S.addConditionPillPhone,
                          ]}
                          onPress={() => openConditionModalForCard(card.id)}
                          activeOpacity={0.9}
                        >
                          <Feather name="plus" size={isPhone ? 18 : 22} color={BLUE} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {isPhone && cartesReliees.length > 1 && (
              <Text style={[
                  S.swipeHint,
                  isTinyPhone && S.swipeHintTiny,
                  isVeryCompactHeight && S.swipeHintVeryCompact,
                ]}>
                Fais glisser pour voir les autres cartes
              </Text>
            )}
          </View>
        </ImageBackground>
      </ScrollView>

      {!!toast && (
        <View style={S.toast}>
          <Text style={S.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={conditionModalVisible} transparent animationType="fade">
        <Pressable
          style={S.modalBg}
          onPress={() => setConditionModalVisible(false)}
        >
          <Pressable style={[S.modalCard, isPhone && S.modalCardPhone]}>
            <Text style={S.modalTitle}>Ajouter une condition</Text>

            <View style={S.conditionChoices}>
              {CONDITION_OPTIONS.map((option) => {
                const active = selectedConditionType === option.type;

                return (
                  <TouchableOpacity
                    key={option.type}
                    style={[
                      S.conditionChoice,
                      isPhone && S.conditionChoicePhone,
                      active && S.conditionChoiceActive,
                    ]}
                    onPress={() => setSelectedConditionType(option.type)}
                    activeOpacity={0.9}
                  >
                    <Feather
                      name={option.icon}
                      size={isPhone ? 15 : 17}
                      color={active ? HEADER_TITLE : BLUE}
                    />
                    <Text
                      style={[
                        S.conditionChoiceText,
                        isPhone && S.conditionChoiceTextPhone,
                        active && S.conditionChoiceTextActive,
                      ]}
                    >
                      {option.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(selectedConditionType === "terminer_x_parcours" ||
              selectedConditionType === "reussir_x_parcours_tentatives") && (
              <TextInput
                value={nbParcours}
                onChangeText={setNbParcours}
                placeholder="Nombre de parcours"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                style={[S.modalInput, isPhone && S.modalInputPhone]}
              />
            )}

            {selectedConditionType === "reussir_x_parcours_tentatives" && (
              <TextInput
                value={nbTentatives}
                onChangeText={setNbTentatives}
                placeholder="Tentatives max"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                style={[S.modalInput, isPhone && S.modalInputPhone]}
              />
            )}

            {selectedConditionType === "pourcentage_avancement" && (
              <TextInput
                value={pourcentage}
                onChangeText={setPourcentage}
                placeholder="Pourcentage d'avancement"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                style={[S.modalInput, isPhone && S.modalInputPhone]}
              />
            )}

            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.cancelBtn}
                onPress={() => setConditionModalVisible(false)}
              >
                <Text style={S.cancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity style={S.validateBtn} onPress={ajouterCondition}>
                <Text style={S.validateText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={infoVisible} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setInfoVisible(false)}>
          <Pressable style={[S.modalCard, isPhone && S.modalCardPhone]}>
            <View style={S.modalIconInfo}>
              <Feather name="info" size={26} color={BLUE} />
            </View>

            <Text style={S.modalTitle}>Principe</Text>

            <Text style={S.modalText}>
              Le score général est placé au-dessus. Choisis ET ou OU pour le
              combiner avec les conditions des cartes de déblocage. Un score à 0
              revient à ne pas imposer de score minimum.
            </Text>

            <TouchableOpacity style={S.fullBtn} onPress={() => setInfoVisible(false)}>
              <Text style={S.fullBtnText}>J'ai compris</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteConditionId} transparent animationType="fade">
        <Pressable style={S.modalBg} onPress={() => setDeleteConditionId(null)}>
          <Pressable style={[S.modalCard, isPhone && S.modalCardPhone]}>
            <View style={S.modalIconDanger}>
              <Feather name="trash-2" size={26} color={DANGER} />
            </View>

            <Text style={S.modalTitle}>Supprimer cette condition ?</Text>

            <Text style={S.modalText}>
              Elle ne sera plus utilisée pour débloquer cette carte.
            </Text>

            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.cancelBtn}
                onPress={() => setDeleteConditionId(null)}
              >
                <Text style={S.cancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={S.deleteBtn}
                onPress={() =>
                  deleteConditionId && supprimerCondition(deleteConditionId)
                }
              >
                <Text style={S.deleteText}>Supprimer</Text>
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
    height: 72,
    backgroundColor: HEADER_BG,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topBarPhone: {
    height: 56,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 8,
  },

  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnPhone: {
    width: 38,
    height: 38,
    borderRadius: 14,
  },

  titleBox: {
    flex: 1,
    minWidth: 0,
  },
  titleMain: {
    color: HEADER_TITLE,
    fontSize: 20,
    fontWeight: "900",
  },
  titleMainPhone: {
    fontSize: 15,
  },
  titleSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  titleSubPhone: {
    fontSize: 11,
    marginTop: 1,
  },

  infoTopIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  pageScroll: {
    flex: 1,
  },
  pageContent: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pageContentPhone: {
    padding: 6,
  },

  mainPanel: {
    width: "100%",
    maxWidth: 1040,
    minHeight: 0,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(170,190,210,0.45)",
    backgroundColor: "#EAF6FF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  mainPanelPhone: {
    minHeight: 0,
    maxWidth: "100%",
    borderRadius: 22,
  },
  mainPanelCompactHeight: {
    borderRadius: 24,
  },

  bgImageStyle: {
    borderRadius: 32,
    transform: [{ scale: 1.12 }],
    opacity: 0.98,
  },
  bgImageStylePhone: {
    borderRadius: 22,
    transform: [{ scale: 1.2 }],
  },

  nameRow: {
    marginTop: 14,
    marginHorizontal: 36,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRowPhone: {
    marginTop: 8,
    marginHorizontal: 18,
    height: 40,
  },
  nameRowCompact: {
    marginTop: 12,
    minHeight: 46,
  },
  nameRowVeryCompact: {
    marginTop: 8,
    minHeight: 36,
  },

  cardNameInput: {
    width: "100%",
    height: 56,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    color: "#000000",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  cardNameInputPhone: {
    height: 40,
    fontSize: 20,
  },
  cardNameInputCompact: {
    minHeight: 44,
    fontSize: 26,
  },
  cardNameInputVeryCompact: {
    minHeight: 34,
    fontSize: 18,
  },

  scoreRow: {
    marginTop: 8,
    marginHorizontal: 28,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.3,
    borderColor: CARD_BORDER,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  scoreRowPhone: {
    marginTop: 6,
    marginHorizontal: 14,
    height: 42,
    borderRadius: 14,
  },
  scoreRowCompact: {
    marginTop: 10,
    minHeight: 46,
  },
  scoreRowVeryCompact: {
    marginTop: 6,
    minHeight: 38,
  },

  scoreLabelBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
  },
  scoreLabelBoxPhone: {
    gap: 7,
    paddingHorizontal: 10,
  },

  scorePlaceholder: {
    color: CARD_SUBTITLE,
    fontSize: 15,
    fontWeight: "900",
  },
  scorePlaceholderPhone: {
    fontSize: 12,
  },

  scoreInput: {
    width: 142,
    alignSelf: "stretch",
    borderLeftWidth: 1,
    borderLeftColor: CARD_BORDER,
    paddingHorizontal: 14,
    color: CARD_TITLE,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  scoreInputPhone: {
    width: 72,
    fontSize: 15,
    paddingHorizontal: 8,
  },

  operatorBridgeRow: {
    marginTop: 10,
    marginHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  operatorBridgeRowPhone: {
    marginTop: 8,
    marginHorizontal: 14,
    gap: 10,
  },
  operatorBridgeRowCompact: {
    marginTop: 10,
  },
  operatorBridgeRowVeryCompact: {
    marginTop: 6,
  },

  bridgeLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(170,190,210,0.65)",
  },

  operatorSegment: {
    width: 190,
    height: 50,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    flexDirection: "row",
    overflow: "hidden",
  },
  operatorSegmentPhone: {
    width: 128,
    height: 38,
  },

  operatorSegmentBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  operatorSegmentBtnActive: {
    backgroundColor: BLUE_DARK,
  },

  operatorSegmentText: {
    color: CARD_TITLE,
    fontSize: 15,
    fontWeight: "900",
  },
  operatorSegmentTextPhone: {
    fontSize: 12,
  },
  operatorSegmentTextActive: {
    color: HEADER_TITLE,
  },

  deckZone: {
    marginTop: 12,
    minHeight: 0,
    paddingBottom: 12,
    justifyContent: "center",
  },
  deckZonePhone: {
    marginTop: 8,
    minHeight: 0,
    paddingBottom: 6,
    justifyContent: "center",
  },
  deckZoneCompact: {
    marginTop: 12,
    minHeight: 0,
    flex: 1,
    paddingBottom: 10,
  },
  deckZoneVeryCompact: {
    marginTop: 8,
    paddingBottom: 4,
  },

  deckScrollContent: {
    paddingHorizontal: 18,
    gap: 16,
    alignItems: "center",
  },
  deckScrollContentPhone: {
    paddingHorizontal: 14,
    gap: 10,
    alignItems: "stretch",
  },
  deckScrollContentCompact: {
    paddingHorizontal: 16,
    gap: 10,
  },

  emptyDeck: {
    marginHorizontal: 26,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 18,
    alignItems: "center",
  },
  emptyDeckPhone: {
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 16,
  },
  emptyDeckCompact: {
    padding: 10,
  },
  emptyDeckText: {
    color: CARD_SUBTITLE,
    fontSize: 13,
    fontWeight: "800",
  },

  unlockCard: {
    width: 245,
    minHeight: 0,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  unlockCardPhone: {
    width: 205,
    minHeight: 0,
    height: 230,
    borderRadius: 18,
  },
  unlockCardCompact: {
    width: 215,
    minHeight: 0,
    height: 250,
    borderRadius: 18,
  },
  unlockCardVeryCompact: {
    width: 185,
    height: 205,
    borderRadius: 16,
  },

  unlockHeader: {
    minHeight: 86,
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  unlockHeaderPhone: {
    minHeight: 54,
    paddingHorizontal: 10,
    gap: 8,
  },
  unlockHeaderCompact: {
    minHeight: 58,
    paddingHorizontal: 10,
    gap: 8,
  },
  unlockHeaderVeryCompact: {
    minHeight: 46,
    paddingHorizontal: 8,
    gap: 6,
  },

  unlockIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  unlockIconCirclePhone: {
    width: 36,
    height: 36,
  },

  unlockCardTitle: {
    flex: 1,
    color: HEADER_TITLE,
    fontSize: 16,
    fontWeight: "900",
  },
  unlockCardTitlePhone: {
    fontSize: 13,
  },

  greenDot: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: SUCCESS,
    borderWidth: 2,
    borderColor: HEADER_TITLE,
  },
  greenDotPhone: {
    right: 8,
    top: 8,
    width: 9,
    height: 9,
    borderWidth: 1.5,
  },

  unlockBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  unlockBodyPhone: {
    padding: 8,
    gap: 6,
  },
  unlockBodyCompact: {
    padding: 8,
    gap: 6,
  },

  emptyConditionSpace: {
    flex: 1,
    minHeight: 0,
  },
  emptyConditionSpacePhone: {
    minHeight: 0,
  },

  conditionsMiniScroll: {
    maxHeight: 118,
  },
  conditionsMiniScrollVeryCompact: {
    maxHeight: 86,
  },

  conditionPill: {
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 7,
  },
  conditionPillPhone: {
    minHeight: 45,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 6,
    marginBottom: 6,
  },

  conditionPillText: {
    flex: 1,
    color: CARD_TITLE,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  conditionPillTextPhone: {
    fontSize: 10.5,
    lineHeight: 13,
  },

  deletePillBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  deletePillBtnPhone: {
    width: 18,
    height: 18,
  },

  addConditionPill: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  addConditionPillPhone: {
    minHeight: 36,
    borderRadius: 12,
  },

  swipeHint: {
    marginTop: 7,
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(15,23,42,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  swipeHintTiny: {
    fontSize: 10,
    marginTop: 4,
  },
  swipeHintVeryCompact: {
    display: "none",
  },

  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 16,
    backgroundColor: CARD_TITLE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 200,
  },
  toastText: {
    color: HEADER_TITLE,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
    gap: 10,
  },
  modalCardPhone: {
    maxWidth: 360,
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },

  modalTitle: {
    color: CARD_TITLE,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  modalText: {
    color: CARD_SUBTITLE,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },

  modalIconInfo: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: TEXT_BG,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  modalIconDanger: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.10)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },

  conditionChoices: {
    gap: 8,
  },
  conditionChoice: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    backgroundColor: "#F8FAFC",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  conditionChoicePhone: {
    borderRadius: 13,
    padding: 9,
    gap: 8,
  },
  conditionChoiceActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },

  conditionChoiceText: {
    flex: 1,
    color: CARD_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },
  conditionChoiceTextPhone: {
    fontSize: 12,
  },
  conditionChoiceTextActive: {
    color: HEADER_TITLE,
  },

  modalInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: CARD_TITLE,
    fontSize: 15,
    fontWeight: "900",
  },
  modalInputPhone: {
    minHeight: 42,
    borderRadius: 13,
    fontSize: 13,
  },

  modalActions: {
    marginTop: 6,
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: CARD_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },
  validateBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  validateText: {
    color: HEADER_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },
  deleteBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: {
    color: HEADER_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },
  fullBtn: {
    width: "100%",
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  fullBtnText: {
    color: HEADER_TITLE,
    fontSize: 13,
    fontWeight: "900",
  },
});

export default ConditionsDeblocageCarte;
