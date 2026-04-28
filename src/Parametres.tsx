import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Shield,
  Lock,
  Edit3,
  Check,
  User,
  Users,
  Palette,
  BookOpen,
  Share2,
  Bell,
  Globe,
  ChevronRight,
  Save,
} from "lucide-react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ========================
   Types
======================== */
type Professeur = {
  user_id: string;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  code?: string | null;
  refuserPartage?: boolean | null;
};

type Props = {
  professeur: Professeur;
  setProfesseur: (p: Professeur) => void;
  supabase: SupabaseClient;
  setPage: (p: string) => void;
};

type TabId =
  | "account"
  | "personal"
  | "appearance"
  | "content"
  | "shares"
  | "notifications"
  | "language";

type MenuDef = {
  id: TabId;
  title: string;
  subtitle: string;
  icon: any;
  accent: string;
};

/* ========================
   Page
======================== */
export default function Parametres({
  professeur,
  setProfesseur,
  supabase,
  setPage,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 760;
  const isPhone = width < 760;

  const [selectedMenu, setSelectedMenu] = useState<TabId>("account");

  const [modifierCode, setModifierCode] = useState(false);
  const [nouveauCodeUnique, setNouveauCodeUnique] = useState(professeur?.code || "");
  const [messageErreurCode, setMessageErreurCode] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  const [loadingProfil, setLoadingProfil] = useState(false);
  const [savingRefuser, setSavingRefuser] = useState(false);

  const [nomDraft, setNomDraft] = useState(professeur?.nom || "");
  const [prenomDraft, setPrenomDraft] = useState(professeur?.prenom || "");
  const [savingPersonal, setSavingPersonal] = useState(false);

  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setNomDraft(professeur?.nom || "");
    setPrenomDraft(professeur?.prenom || "");
  }, [professeur?.nom, professeur?.prenom]);

  useEffect(() => {
    const refreshProfIfNeeded = async () => {
      if (!professeur?.user_id) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      setLoadingProfil(true);

      const timeout = (ms: number) =>
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

      try {
        const fetchPromise = supabase
          .from("professeurs")
          .select("user_id, nom, prenom, email, code, refuserPartage")
          .eq("user_id", professeur.user_id)
          .maybeSingle();

        const result = await Promise.race([fetchPromise, timeout(6000)]);
        if (result === null) {
          console.warn("⚠️ Supabase professeurs: time-out (>6s)");
          return;
        }

        const { data, error } = result as Awaited<typeof fetchPromise>;
        if (error) {
          console.warn("refresh prof error:", error);
          return;
        }

        if (data && mountedRef.current) {
          setProfesseur({
            user_id: data.user_id,
            nom: data.nom,
            prenom: data.prenom,
            email: data.email,
            code: data.code,
            refuserPartage: data.refuserPartage,
          });
        }
      } finally {
        if (mountedRef.current) setLoadingProfil(false);
        isFetchingRef.current = false;
      }
    };

    refreshProfIfNeeded();
  }, [professeur?.user_id, supabase, setProfesseur]);

  useEffect(() => {
    setNouveauCodeUnique((professeur?.code ?? "").toUpperCase());
  }, [professeur?.code]);

  const onSaveCode = async () => {
    if (!professeur?.user_id) return;

    const code = (nouveauCodeUnique || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (code.length < 6) {
      setMessageErreurCode("Le code doit contenir au moins 6 caractères.");
      return;
    }

    setSavingCode(true);
    setMessageErreurCode("");

    try {
      const { data: exists, error: checkErr } = await supabase
        .from("professeurs")
        .select("user_id")
        .eq("code", code);

      if (checkErr) {
        setMessageErreurCode("Erreur lors de la vérification du code.");
        return;
      }

      if (
        exists &&
        exists.length > 0 &&
        exists.some((r: any) => r.user_id !== professeur.user_id)
      ) {
        setMessageErreurCode("Code déjà utilisé.");
        return;
      }

      const { error } = await supabase
        .from("professeurs")
        .update({ code })
        .eq("user_id", professeur.user_id);

      if (error) {
        setMessageErreurCode("Erreur lors de l’enregistrement du code.");
        return;
      }

      setProfesseur({ ...professeur, code });
      setModifierCode(false);
      Alert.alert("Succès", "Le code unique a bien été mis à jour.");
    } finally {
      setSavingCode(false);
    }
  };

  const onSavePersonal = async () => {
    if (!professeur?.user_id || savingPersonal) return;

    const nom = (nomDraft || "").trim();
    const prenom = (prenomDraft || "").trim();

    if (!nom || !prenom) {
      Alert.alert("Champs manquants", "Veuillez renseigner le nom et le prénom.");
      return;
    }

    setSavingPersonal(true);

    try {
      const { error } = await supabase
        .from("professeurs")
        .update({
          nom,
          prenom,
        })
        .eq("user_id", professeur.user_id);

      if (error) {
        Alert.alert("Erreur", "Impossible d’enregistrer les informations du profil.");
        return;
      }

      setProfesseur({
        ...professeur,
        nom,
        prenom,
      });

      Alert.alert("Succès", "Vos informations ont bien été enregistrées.");
    } finally {
      setSavingPersonal(false);
    }
  };

  const onToggleRefuserPartage = async () => {
    if (!professeur?.user_id || savingRefuser) return;
    const newVal = !(professeur.refuserPartage ?? false);

    setSavingRefuser(true);
    const prev = professeur;
    setProfesseur({ ...professeur, refuserPartage: newVal });

    const { error } = await supabase
      .from("professeurs")
      .update({ refuserPartage: newVal })
      .eq("user_id", professeur.user_id);

    setSavingRefuser(false);

    if (error) {
      setProfesseur(prev);
      Alert.alert("Erreur", "Erreur lors de la mise à jour du paramètre de partage.");
    }
  };

  const displayCode = useMemo(() => {
    const c = (professeur?.code ?? "").trim();
    return c.length ? c.toUpperCase() : "AUCUN CODE DÉFINI";
  }, [professeur?.code]);

  const menuItems = useMemo<MenuDef[]>(
    () => [
      {
        id: "account",
        title: "Compte",
        subtitle: "Code et sécurité",
        icon: User,
        accent: "#60A5FA",
      },
      {
        id: "personal",
        title: "Profil",
        subtitle: "Nom et prénom",
        icon: Users,
        accent: "#34D399",
      },
      {
        id: "appearance",
        title: "Apparence",
        subtitle: "Personnalisation",
        icon: Palette,
        accent: "#A78BFA",
      },
      {
        id: "content",
        title: "Contenus",
        subtitle: "Ressources pédagogiques",
        icon: BookOpen,
        accent: "#F59E0B",
      },
      {
        id: "shares",
        title: "Partages",
        subtitle: "Autorisations",
        icon: Share2,
        accent: "#22D3EE",
      },
      {
        id: "notifications",
        title: "Notifications",
        subtitle: "Alertes et emails",
        icon: Bell,
        accent: "#FB7185",
      },
      {
        id: "language",
        title: "Langue",
        subtitle: "Région et formats",
        icon: Globe,
        accent: "#38BDF8",
      },
    ],
    []
  );

  const activeMenu = menuItems.find((m) => m.id === selectedMenu);

  return (
    <LinearGradient
      colors={["#0b1220", "#0f172a", "#111827"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: isDesktop ? 24 : isTablet ? 18 : 12,
            paddingHorizontal: isDesktop ? 24 : isTablet ? 18 : 12,
            paddingBottom: isPhone ? 120 : 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[
            "rgba(96,165,250,0.16)",
            "rgba(168,85,247,0.12)",
            "rgba(249,115,22,0.12)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            {
              padding: isDesktop ? 22 : 16,
              borderRadius: isDesktop ? 28 : 22,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              onPress={() => setPage("AccueilProf")}
              activeOpacity={0.88}
              style={styles.backBtn}
            >
              <ArrowLeft color="#E5EEF8" size={18} />
              <Text style={styles.backBtnText}>Retour</Text>
            </TouchableOpacity>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>PARAMÈTRES</Text>
            </View>
          </View>

          <View style={[styles.heroContent, { marginTop: 14 }]}>
            <View style={styles.heroTitleWrap}>
              <View style={styles.heroIconBox}>
                <Shield color="#DCEBFF" size={22} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle}>Paramètres</Text>
                <Text style={styles.heroSubtitle}>
                  Gérez votre compte, votre profil et vos préférences.
                </Text>
              </View>
            </View>

            <View style={styles.heroUserCard}>
              <Text style={styles.heroUserLabel}>Compte connecté</Text>
              <Text style={styles.heroUserName}>
                {`${professeur?.prenom || ""} ${professeur?.nom || ""}`.trim() || "Professeur"}
              </Text>
              <Text style={styles.heroUserEmail}>
                {professeur?.email || "Aucune adresse email"}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View
          style={[
            styles.layout,
            {
              flexDirection: isDesktop ? "row" : "column",
              gap: isDesktop ? 18 : 14,
              marginTop: 16,
            },
          ]}
        >
          <View
            style={[
              styles.sidebarCard,
              {
                width: isDesktop ? 320 : "100%",
                padding: isDesktop ? 18 : 14,
              },
            ]}
          >
            <Text style={styles.sidebarTitle}>Navigation</Text>
            <Text style={styles.sidebarSubtitle}>Sélectionnez une catégorie.</Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {menuItems.map((item) => (
                <NavItem
                  key={item.id}
                  active={selectedMenu === item.id}
                  onPress={() => setSelectedMenu(item.id)}
                  icon={item.icon}
                  title={item.title}
                  desc={item.subtitle}
                  accent={item.accent}
                />
              ))}
            </View>
          </View>

          <View style={[styles.content, { flex: 1, gap: 14 }]}>
            <View style={styles.sectionIntroCard}>
              <View style={styles.sectionIntroLeft}>
                <View
                  style={[
                    styles.sectionIntroIconBox,
                    { backgroundColor: `${activeMenu?.accent ?? "#60A5FA"}22` },
                  ]}
                >
                  {activeMenu ? (
                    <activeMenu.icon color={activeMenu.accent} size={20} />
                  ) : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sectionIntroTitle}>{activeMenu?.title}</Text>
                  <Text style={styles.sectionIntroSubtitle}>{activeMenu?.subtitle}</Text>
                </View>
              </View>
            </View>

            {selectedMenu === "account" && (
              <>
                <SectionCard
                  icon={<Shield color="#DDEBFF" size={20} />}
                  title="Code unique"
                  subtitle="Code d’identification utilisé pour l’association."
                  accent={["#2563EB", "#7C3AED"]}
                >
                  {!modifierCode ? (
                    <View
                      style={[
                        styles.responsiveRow,
                        { alignItems: isPhone ? "flex-start" : "center" },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.labelMini}>Code actuel</Text>

                        <View style={styles.codeWrap}>
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={styles.codePill}
                          >
                            {displayCode}
                          </Text>

                          {loadingProfil ? (
                            <View style={styles.loadingInline}>
                              <ActivityIndicator size="small" color="#93C5FD" />
                              <Text style={styles.loadingInlineText}>Chargement</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.primaryBtn, styles.orangeBtn]}
                        onPress={() => {
                          setModifierCode(true);
                          setNouveauCodeUnique(
                            displayCode === "AUCUN CODE DÉFINI" ? "" : displayCode
                          );
                        }}
                        activeOpacity={0.9}
                      >
                        <Edit3 color="#fff" size={16} />
                        <Text style={styles.primaryBtnText}>Modifier</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>Nouveau code</Text>
                      <TextInput
                        style={styles.input}
                        value={nouveauCodeUnique}
                        onChangeText={(v) =>
                          setNouveauCodeUnique(
                            v.toUpperCase().replace(/[^A-Z0-9]/g, "")
                          )
                        }
                        autoCapitalize="characters"
                        placeholder="ENTREZ VOTRE CODE"
                        placeholderTextColor="#7D91AA"
                        maxLength={20}
                      />

                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          onPress={onSaveCode}
                          disabled={savingCode}
                          style={[
                            styles.primaryBtn,
                            styles.greenBtn,
                            savingCode && styles.disabledBtn,
                          ]}
                          activeOpacity={0.9}
                        >
                          <Check color="#fff" size={16} />
                          <Text style={styles.primaryBtnText}>
                            {savingCode ? "Enregistrement..." : "Valider"}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            setModifierCode(false);
                            setMessageErreurCode("");
                            setNouveauCodeUnique((professeur?.code ?? "").toUpperCase());
                          }}
                          style={styles.secondaryBtn}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.secondaryBtnText}>Annuler</Text>
                        </TouchableOpacity>
                      </View>

                      {!!messageErreurCode && (
                        <Text style={styles.errorText}>{messageErreurCode}</Text>
                      )}
                    </>
                  )}
                </SectionCard>

                <SectionCard
                  icon={<Lock color="#FFE7E7" size={20} />}
                  title="Sécurité"
                  subtitle="Modifiez le mot de passe de votre compte."
                  accent={["#DC2626", "#F97316"]}
                >
                  <TouchableOpacity
                    onPress={() => setPage("NouveauMotDePasse")}
                    style={[styles.primaryBtn, styles.redBtn, { alignSelf: "flex-start" }]}
                    activeOpacity={0.9}
                  >
                    <Lock color="#fff" size={16} />
                    <Text style={styles.primaryBtnText}>Modifier le mot de passe</Text>
                  </TouchableOpacity>
                </SectionCard>
              </>
            )}

            {selectedMenu === "personal" && (
              <SectionCard
                icon={<Users color="#D7FAE8" size={20} />}
                title="Données personnelles"
                subtitle="Mettez à jour les informations de votre profil."
                accent={["#059669", "#0EA5A4"]}
              >
                <View style={styles.formGrid}>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Nom</Text>
                    <TextInput
                      value={nomDraft}
                      onChangeText={setNomDraft}
                      placeholder="Votre nom"
                      placeholderTextColor="#7D91AA"
                      style={[styles.input, styles.normalTextInput]}
                    />
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Prénom</Text>
                    <TextInput
                      value={prenomDraft}
                      onChangeText={setPrenomDraft}
                      placeholder="Votre prénom"
                      placeholderTextColor="#7D91AA"
                      style={[styles.input, styles.normalTextInput]}
                    />
                  </View>

                  <View style={[styles.formField, { width: "100%" }]}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoBoxText}>
                        {professeur?.email || "Aucune adresse email renseignée"}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={onSavePersonal}
                    disabled={savingPersonal}
                    style={[
                      styles.primaryBtn,
                      styles.greenBtn,
                      savingPersonal && styles.disabledBtn,
                      { alignSelf: "flex-start" },
                    ]}
                    activeOpacity={0.9}
                  >
                    {savingPersonal ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Save color="#fff" size={16} />
                        <Text style={styles.primaryBtnText}>Enregistrer</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </SectionCard>
            )}

            {selectedMenu === "appearance" && (
              <SectionCard
                icon={<Palette color="#EFE2FF" size={20} />}
                title="Apparence"
                subtitle="Personnalisation de l’interface."
                accent={["#7C3AED", "#A855F7"]}
              >
                <ComingSoonText text="Les options d’apparence seront ajoutées prochainement." />
              </SectionCard>
            )}

            {selectedMenu === "content" && (
              <SectionCard
                icon={<BookOpen color="#FFE8C9" size={20} />}
                title="Contenu pédagogique"
                subtitle="Gérez vos contenus et vos ressources."
                accent={["#EA580C", "#F59E0B"]}
              >
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      "Bientôt disponible",
                      "Le gestionnaire de contenus sera ajouté prochainement."
                    )
                  }
                  style={[styles.primaryBtn, styles.orangeBtn, { alignSelf: "flex-start" }]}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryBtnText}>Ouvrir le gestionnaire</Text>
                  <ChevronRight color="#fff" size={16} />
                </TouchableOpacity>
              </SectionCard>
            )}

            {selectedMenu === "shares" && (
              <SectionCard
                icon={<Share2 color="#DBFAFF" size={20} />}
                title="Partages"
                subtitle="Autorisez ou refusez les partages d’autres enseignants."
                accent={["#0891B2", "#2563EB"]}
              >
                <View style={styles.toggleCard}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onToggleRefuserPartage}
                    disabled={savingRefuser}
                    style={[
                      styles.toggleTrack,
                      professeur?.refuserPartage ? styles.toggleOff : styles.toggleOn,
                      savingRefuser && { opacity: 0.65 },
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        professeur?.refuserPartage
                          ? { transform: [{ translateX: 2 }] }
                          : { transform: [{ translateX: 28 }] },
                      ]}
                    />
                  </TouchableOpacity>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.toggleTitle}>
                      {professeur?.refuserPartage
                        ? "Partages refusés"
                        : "Partages autorisés"}
                    </Text>
                    <Text style={styles.toggleDesc}>
                      {professeur?.refuserPartage
                        ? "Vous ne recevrez pas de partages entrants."
                        : "Vous pouvez recevoir des partages d’autres professeurs."}
                    </Text>
                  </View>
                </View>
              </SectionCard>
            )}

            {selectedMenu === "notifications" && (
              <SectionCard
                icon={<Bell color="#FFE2E7" size={20} />}
                title="Notifications"
                subtitle="Préférences de notification."
                accent={["#E11D48", "#FB7185"]}
              >
                <ComingSoonText text="Les notifications email et in-app seront disponibles plus tard." />
              </SectionCard>
            )}

            {selectedMenu === "language" && (
              <SectionCard
                icon={<Globe color="#DCEFFF" size={20} />}
                title="Langue & région"
                subtitle="Formats régionaux et langue d’affichage."
                accent={["#0EA5E9", "#6366F1"]}
              >
                <ComingSoonText text="Les réglages de langue et de région seront ajoutés prochainement." />
              </SectionCard>
            )}
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

/* ========================
   Sous-composants
======================== */
function NavItem({
  active,
  onPress,
  icon: Icon,
  title,
  desc,
  accent,
}: {
  active: boolean;
  onPress: () => void;
  icon: any;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[styles.navItem, active && styles.navItemActive]}
    >
      <View
        style={[
          styles.navIconWrap,
          { backgroundColor: active ? `${accent}30` : "rgba(148,163,184,0.10)" },
        ]}
      >
        <Icon color={active ? accent : "#D7E2F0"} size={18} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navLabel}>{title}</Text>
        <Text style={styles.navDesc}>{desc}</Text>
      </View>

      <ChevronRight color={active ? accent : "#6B7D93"} size={16} />
    </TouchableOpacity>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: [string, string];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCardOuter}>
      <LinearGradient
        colors={[`${accent[0]}22`, `${accent[1]}14`, "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sectionCardGlow}
      />
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderIcon}>{icon}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionCardTitle}>{title}</Text>
            <Text style={styles.sectionCardSubtitle}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.sectionBody}>{children}</View>
      </View>
    </View>
  );
}

function ComingSoonText({ text }: { text: string }) {
  return <Text style={styles.mutedText}>{text}</Text>;
}

/* ========================
   Styles
======================== */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scroll: {
    flexGrow: 1,
  },

  hero: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.72)",
    overflow: "hidden",
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },

  backBtnText: {
    color: "#E5EEF8",
    fontWeight: "700",
  },

  heroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.14)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.24)",
  },

  heroBadgeText: {
    color: "#CFE5FF",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },

  heroContent: {
    gap: 16,
  },

  heroTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.24)",
  },

  heroTitle: {
    color: "#F8FBFF",
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: -0.4,
  },

  heroSubtitle: {
    color: "#AFC3D8",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },

  heroUserCard: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,23,42,0.48)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },

  heroUserLabel: {
    color: "#7FA2C5",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },

  heroUserName: {
    color: "#F5FAFF",
    fontWeight: "800",
    fontSize: 16,
  },

  heroUserEmail: {
    color: "#AFC3D8",
    marginTop: 2,
    fontSize: 13,
  },

  layout: {},

  sidebarCard: {
    backgroundColor: "rgba(15,23,42,0.72)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
  },

  sidebarTitle: {
    color: "#F5FAFF",
    fontSize: 20,
    fontWeight: "800",
  },

  sidebarSubtitle: {
    color: "#91A7BF",
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },

  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.08)",
  },

  navItemActive: {
    backgroundColor: "rgba(59,130,246,0.08)",
    borderColor: "rgba(96,165,250,0.20)",
  },

  navIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  navLabel: {
    color: "#ECF5FF",
    fontWeight: "800",
    fontSize: 14,
  },

  navDesc: {
    color: "#8FA7C0",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },

  content: {},

  sectionIntroCard: {
    backgroundColor: "rgba(15,23,42,0.72)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  sectionIntroLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  sectionIntroIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionIntroTitle: {
    color: "#F5FAFF",
    fontWeight: "800",
    fontSize: 18,
  },

  sectionIntroSubtitle: {
    color: "#8FA7C0",
    marginTop: 2,
    fontWeight: "600",
    fontSize: 13,
  },

  sectionCardOuter: {
    position: "relative",
    borderRadius: 24,
    overflow: "hidden",
  },

  sectionCardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },

  sectionCard: {
    backgroundColor: "rgba(15,23,42,0.82)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
    padding: 16,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  sectionHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  sectionCardTitle: {
    color: "#F8FBFF",
    fontWeight: "800",
    fontSize: 18,
  },

  sectionCardSubtitle: {
    color: "#93A8BF",
    marginTop: 3,
    fontSize: 13,
    fontWeight: "600",
  },

  sectionBody: {
    gap: 14,
  },

  responsiveRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    justifyContent: "space-between",
    gap: 12,
  },

  labelMini: {
    color: "#8FA7C0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },

  codeWrap: {
    gap: 8,
  },

  codePill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    color: "#D6EFFF",
    backgroundColor: "rgba(59,130,246,0.12)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: Platform.select({
      web: "ui-monospace, Menlo, monospace",
      default: undefined,
    }),
  },

  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  loadingInlineText: {
    color: "#91A7BF",
    fontSize: 12,
    fontWeight: "700",
  },

  formGrid: {
    gap: 14,
  },

  formField: {
    width: "100%",
  },

  fieldLabel: {
    color: "#D9E8F7",
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 13,
  },

  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#F4F8FC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    textTransform: "uppercase",
  },

  normalTextInput: {
    textTransform: "none",
  },

  infoBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  infoBoxText: {
    color: "#D9E8F7",
    fontWeight: "600",
  },

  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryBtnText: {
    color: "#D6E3F2",
    fontWeight: "700",
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  orangeBtn: {
    backgroundColor: "#F59E0B",
  },

  greenBtn: {
    backgroundColor: "#10B981",
  },

  redBtn: {
    backgroundColor: "#EF4444",
  },

  disabledBtn: {
    opacity: 0.6,
  },

  errorText: {
    color: "#FCA5A5",
    marginTop: 2,
    fontWeight: "700",
  },

  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.12)",
    padding: 14,
  },

  toggleTrack: {
    width: 56,
    height: 30,
    borderRadius: 999,
    padding: 2,
    justifyContent: "center",
    flexShrink: 0,
  },

  toggleOn: {
    backgroundColor: "#2563EB",
  },

  toggleOff: {
    backgroundColor: "#7F1D1D",
  },

  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  toggleTitle: {
    color: "#F7FBFF",
    fontWeight: "800",
    fontSize: 15,
  },

  toggleDesc: {
    color: "#94AAC2",
    marginTop: 3,
    fontSize: 13,
    fontWeight: "600",
  },

  mutedText: {
    color: "#AABED3",
    fontSize: 14,
    fontWeight: "600",
  },
});