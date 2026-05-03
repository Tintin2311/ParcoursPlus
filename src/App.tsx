// src/App.tsx
import React, { useEffect, useState, Suspense, useCallback } from "react";
import {
  Platform,
  SafeAreaView,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";
import BottomBar from "./ui/BottomBar";
import MotDePasseByMail from "./MotDePasseByMail";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/* =========================
   IMPORTS DYNAMIQUES
========================= */
const ParcoursPlus = React.lazy(() => import("./ParcoursPlus"));
const CreationCompteProf = React.lazy(() => import("./CreationCompteProf"));
const AccueilProf = React.lazy(() => import("./AccueilProf"));
const Parametres = React.lazy(() => import("./Parametres"));
const GestionGroupes = React.lazy(() => import("./GestionGroupes"));
const GestionEleves = React.lazy(() => import("./GestionEleves"));
const GestionBalises = React.lazy(() => import("./GestionBalises"));
const CreationBalise = React.lazy(() => import("./CreationBalise"));
const GestionParcours = React.lazy(() => import("./GestionParcours"));
const CreerUnNouveauParcours = React.lazy(() => import("./CreerUnNouveauParcours"));
const ModifierUnParcours = React.lazy(() => import("./ModifierUnParcours"));
const MesParcours = React.lazy(() => import("./MesParcours"));
const NouveauMotDePasse = React.lazy(() => import("./NouveauMotDePasse"));

const GestionResultats = React.lazy(() => import("./GestionResultats")) as React.LazyExoticComponent<React.ComponentType<any>>;
const GestionResultatsTentatives = React.lazy(() => import("./GestionResultatsTentatives")) as React.LazyExoticComponent<React.ComponentType<any>>;
const GestionResultatsProgressivite = React.lazy(() => import("./GestionResultatsProgressivite")) as React.LazyExoticComponent<React.ComponentType<any>>;
const GestionPoints = React.lazy(() => import("./GestionPoints")) as React.LazyExoticComponent<React.ComponentType<any>>;
const Association = React.lazy(() => import("./Association")) as React.LazyExoticComponent<React.ComponentType<any>>;

const AccueilEleve = React.lazy(() => import("./AccueilEleve"));
const ClassementEleve = React.lazy(() => import("./SessionEleve/ClassementEleve"));
const EcrireResultat = React.lazy(() => import("./EcrireResultat")) as React.LazyExoticComponent<React.ComponentType<any>>;
const EcrireCodeBaliseEleve = React.lazy(() => import("./EcrireCodeBaliseEleve")) as React.LazyExoticComponent<React.ComponentType<any>>;

const Jeudeserreurs = React.lazy(() => import("./Jeux/Jeudeserreurs"));
const CreerJeuDesErreurs = React.lazy(() => import("./Jeux/CreerJeuDesErreurs"));

const StatistiquesEleve = React.lazy(() => import("./StatistiquesEleve"));
const MotDePasseOublie = React.lazy(() => import("./MotDePasseOublie"));
const PartageParcours = React.lazy(() => import("./PartageParcours"));
const ObjectifsEleve = React.lazy(() => import("./ObjectifsEleve"));
const ConfigurationPersonnalisee = React.lazy(() => import("./ConfigurationPersonnalisee"));

const BaliseCode = React.lazy(() => import("./CodesBalises/BaliseCode"));
const BaliseTableau = React.lazy(() => import("./CodesBalises/BaliseTableau"));
const BaliseQRcode = React.lazy(() => import("./CodesBalises/BaliseQRcode"));
const BalisePoincon = React.lazy(() => import("./CodesBalises/BalisePoincon"));

/* =========================
   TYPES
========================= */
type Mode = "accueil" | "prof" | "eleve";

type PageType =
  | "accueil"
  | "AccueilProf"
  | "ClassementEleve"
  | "Parametres"
  | "gestionGroupes"
  | "GestionEleves"
  | "gestionBalises"
  | "CreationBalise"
  | "gestionParcours"
  | "CreerUnNouveauParcours"
  | "CreerJeuDesErreurs"
  | "ModifierUnParcours"
  | "MesParcours"
  | "GestionResultats"
  | "GestionResultatsTentatives"
  | "GestionResultatsProgressivite"
  | "GestionPoints"
  | "Association"
  | "EcrireResultat"
  | "EcrireCodeBaliseEleve"
  | "Jeudeserreurs"
  | "StatistiquesEleve"
  | "PartageParcours"
  | "CreationCompteProf"
  | "MotDePasseOublie"
  | "NouveauMotDePasse"
  | "MotDePasseByMail"
  | "AccueilEleve"
  | "ObjectifsEleve"
  | "configurationPersonnalisee"
  | "gestionResultatsTentatives_parcours"
  | "BaliseCode"
  | "BaliseTableau"
  | "BaliseQRcode"
  | "BalisePoincon";

type EleveType = {
  id?: string;
  uuid?: string;
  code?: string;
  teacher_id?: string | null;
  group_id?: string | null;
  display_name?: string | null;
};

type Professeur = {
  user_id: string;
  id_uuid?: string;
  code?: string | null;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  refuserPartage?: boolean | null;
};

type SelectedGroup = { id: string; nom: string; eleves: any[]; color?: string };

type PageInput =
  | string
  | PageType
  | {
      name?: string;
      page?: string;
      parcoursId?: string | null;
      id?: string | null;
    };

/* =========================
   STORAGE
========================= */
const LS_LAST_PAGE_PROF = "dernierePage";
const LS_LAST_PAGE_ELEVE = "dernierePageEleve";
const LS_ELEVE_CACHE = "eleveCache";
const LS_LAST_MODE = "derniereConnexionMode";
const LS_RECOVERY_FLOW = "parcoursplus_recovery_flow";

const storage = {
  async get(key: string) {
    try {
      return Platform.OS === "web"
        ? window.localStorage.getItem(key)
        : await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string) {
    try {
      if (Platform.OS === "web") window.localStorage.setItem(key, value);
      else await AsyncStorage.setItem(key, value);
    } catch {}
  },

  async multiRemove(keys: string[]) {
    try {
      if (Platform.OS === "web") keys.forEach((k) => window.localStorage.removeItem(k));
      else await AsyncStorage.multiRemove(keys);
    } catch {}
  },
};

const setRecoveryFlag = () => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(LS_RECOVERY_FLOW, "1");
    } catch {}
  }
};

const clearRecoveryFlag = () => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(LS_RECOVERY_FLOW);
    } catch {}
  }
};

const hasRecoveryFlag = () => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      return window.sessionStorage.getItem(LS_RECOVERY_FLOW) === "1";
    } catch {
      return false;
    }
  }
  return false;
};

/* =========================
   NORMALISATION PAGES
========================= */
const normalizePage = (value: string | null | undefined): PageType => {
  const raw = (value || "").trim();
  const lower = raw.toLowerCase();

  switch (lower) {
    case "accueil": return "accueil";
    case "accueilprof": return "AccueilProf";
    case "parametres": return "Parametres";
    case "gestiongroupes": return "gestionGroupes";
    case "gestioneleves": return "GestionEleves";
    case "gestionbalises": return "gestionBalises";
    case "creationbalise": return "CreationBalise";
    case "gestionparcours": return "gestionParcours";
    case "creerunnouveauparcours": return "CreerUnNouveauParcours";
    case "creerjeudeserreurs": return "CreerJeuDesErreurs";
    case "modifierunparcours": return "ModifierUnParcours";
    case "mesparcours": return "MesParcours";
    case "gestionresultats": return "GestionResultats";
    case "gestionresultatstentatives": return "GestionResultatsTentatives";
    case "gestionresultatsprogressivite": return "GestionResultatsProgressivite";
    case "gestionpoints": return "GestionPoints";
    case "association": return "Association";
    case "ecrireresultat": return "EcrireResultat";
    case "ecrirecodebaliseeleve": return "EcrireCodeBaliseEleve";
    case "jeudeserreurs": return "Jeudeserreurs";
    case "statistiqueseleve": return "StatistiquesEleve";
    case "partageparcours": return "PartageParcours";
    case "creationcompteprof": return "CreationCompteProf";
    case "motdepasseoublie": return "MotDePasseOublie";
    case "nouveaumotdepasse": return "NouveauMotDePasse";
    case "motdepassebymail": return "MotDePasseByMail";
    case "accueileleve": return "AccueilEleve";
    case "classementeleve": return "ClassementEleve";
    case "objectifseleve": return "ObjectifsEleve";
    case "configurationpersonnalisee": return "configurationPersonnalisee";
    case "gestionresultatstentatives_parcours": return "gestionResultatsTentatives_parcours";
    case "balisecode": return "BaliseCode";
    case "balisetableau": return "BaliseTableau";
    case "baliseqrcode": return "BaliseQRcode";
    case "balisepoincon": return "BalisePoincon";
    default: return raw as PageType;
  }
};

const PROF_TAB_PAGES = new Set<PageType>([
  "AccueilProf",
  "gestionGroupes",
  "gestionBalises",
  "gestionParcours",
  "GestionResultats",
]);

const ELEVE_PAGES = new Set<PageType>([
  "AccueilEleve",
  "ClassementEleve",
  "EcrireResultat",
  "EcrireCodeBaliseEleve",
  "Jeudeserreurs",
  "StatistiquesEleve",
  "ObjectifsEleve",
]);

const PUBLIC_PAGES = new Set<PageType>([
  "accueil",
  "CreationCompteProf",
  "MotDePasseOublie",
  "NouveauMotDePasse",
  "MotDePasseByMail",
]);

const PROF_EXTRA_PAGES = new Set<PageType>([
  "Parametres",
  "GestionEleves",
  "CreationBalise",
  "CreerUnNouveauParcours",
  "CreerJeuDesErreurs",
  "ModifierUnParcours",
  "MesParcours",
  "GestionResultatsTentatives",
  "GestionResultatsProgressivite",
  "GestionPoints",
  "PartageParcours",
  "Association",
  "configurationPersonnalisee",
  "gestionResultatsTentatives_parcours",
  "NouveauMotDePasse",
  "BaliseCode",
  "BaliseTableau",
  "BaliseQRcode",
  "BalisePoincon",
]);

const ALL_KNOWN_PAGES = new Set<PageType>([
  ...Array.from(PROF_TAB_PAGES),
  ...Array.from(ELEVE_PAGES),
  ...Array.from(PUBLIC_PAGES),
  ...Array.from(PROF_EXTRA_PAGES),
]);

const pageToTabId = (p: PageType) => {
  const normalized = normalizePage(p);

  switch (normalized) {
    case "AccueilProf": return "accueil";

    case "GestionPoints":
    case "GestionResultatsTentatives":
    case "GestionResultatsProgressivite":
    case "gestionResultatsTentatives_parcours":
    case "GestionResultats":
      return "gestionResultats";

    case "CreationBalise":
    case "BaliseCode":
    case "BaliseTableau":
    case "BaliseQRcode":
    case "BalisePoincon":
      return "gestionBalises";

    case "CreerUnNouveauParcours":
    case "CreerJeuDesErreurs":
    case "ModifierUnParcours":
    case "MesParcours":
      return "gestionParcours";

    default:
      return normalized;
  }
};

const tabIdToPage = (id: string): PageType => {
  const raw = (id || "").trim().toLowerCase();

  switch (raw) {
    case "accueil": return "AccueilProf";
    case "gestiongroupes": return "gestionGroupes";
    case "gestionbalises": return "gestionBalises";
    case "gestionparcours": return "gestionParcours";
    case "gestionresultats": return "GestionResultats";
    case "gestionpoints": return "GestionPoints";
    default: return normalizePage(id);
  }
};

const getRecoveryInfoFromUrl = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return { isRecovery: false, isError: false, errorCode: "", errorDescription: "" };
  }

  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const href = window.location.href || "";
  const lower = `${href} ${search} ${hash}`.toLowerCase();

  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const errorCode = hashParams.get("error_code") || searchParams.get("error_code") || "";
  const errorDescription =
    hashParams.get("error_description") || searchParams.get("error_description") || "";

  return {
    isRecovery:
      lower.includes("type=recovery") ||
      lower.includes("access_token=") ||
      lower.includes("refresh_token=") ||
      lower.includes("token_hash="),
    isError: lower.includes("error=") || lower.includes("error_code=") || !!errorCode,
    errorCode,
    errorDescription,
  };
};

/* =========================
   APP
========================= */
export default function App() {
  const [page, setPage] = useState<PageType>("accueil");
  const [modeConnexion, setModeConnexion] = useState<Mode>("accueil");
  const [chargementInitial, setChargementInitial] = useState(true);

  const [professeur, setProfesseur] = useState<Professeur | null>(null);
  const [eleve, setEleve] = useState<EleveType | null>(null);
  const [recoveryErrorMessage, setRecoveryErrorMessage] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  const [parcoursId, setParcoursId] = useState<string | null>(null);

  const [professeurs] = useState<Professeur[]>([]);
  const [parcoursGlobaux, setParcoursGlobaux] = useState<any[]>([]);
  const [dossiersParcours] = useState<any[]>([]);
  const [groupes] = useState<any[]>([]);
  const [parcoursActif, setParcoursActif] = useState<any>(null);
  const [resultatsEleves] = useState<any[]>([]);
  const [parcoursTerminesEleves] = useState<any[]>([]);
  const [, setAffichageResultat] = useState(false);

  const [newProfPrenom, setNewProfPrenom] = useState("");
  const [newProfName, setNewProfName] = useState("");
  const [newProfEmail, setNewProfEmail] = useState("");
  const [newProfCode, setNewProfCode] = useState("");
  const [newProfPassword, setNewProfPassword] = useState("");
  const [newProfPasswordConfirm, setNewProfPasswordConfirm] = useState("");
  const [, setCodeValidationEnvoye] = useState("");

  const [baremeEvaluation] = useState<any[]>([
    { type: "=", tentatives: 1, couleur: "green", points: 1 },
    { type: "=", tentatives: 2, couleur: "yellow", points: 0.5 },
    { type: "=", tentatives: 3, couleur: "orange", points: 0 },
    { type: "≥", tentatives: 4, couleur: "red", points: -1 },
  ]);

  const [modePoints] = useState<"cumul" | "best">("cumul");
  const [baremePointsGlobal] = useState({
    pointsParParcours: 0,
    baremeTentatives: [] as any[],
  });
  const [baremePointsParcours] = useState<any>({});

  const setNormalizedPage = useCallback((next: PageInput) => {
    if (typeof next === "object" && next !== null) {
      const nextParcoursId = next.parcoursId ?? next.id ?? null;
      const nextName = next.name ?? next.page ?? "";

      if (typeof nextParcoursId === "string" || nextParcoursId === null) {
        setParcoursId(nextParcoursId);
      }

      setPage(normalizePage(nextName));
      return;
    }

    setPage(normalizePage(String(next)));
  }, []);

  const goStr = useCallback(
    (p: any) => {
      setNormalizedPage(p);
    },
    [setNormalizedPage]
  );

  const setEleveAndCache = async (e: EleveType | null) => {
    setEleve(e);
    if (!e) return;
    await storage.set(LS_ELEVE_CACHE, JSON.stringify(e));
    await storage.set(LS_LAST_PAGE_ELEVE, "AccueilEleve");
    await storage.set(LS_LAST_MODE, "eleve");
  };

  const fetchProfesseurFromSupabase = useCallback(
    async (userId: string, emailFromAuth?: string | null) => {
      try {
        const { data, error } = await supabase
          .from("professeurs")
          .select("user_id, id_uuid, code, nom, prenom, email, refuserPartage")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) console.error("Erreur fetchProfesseurFromSupabase :", error);

        if (data) {
          return {
            user_id: data.user_id ?? userId,
            id_uuid: data.id_uuid ?? undefined,
            code: data.code ?? null,
            nom: data.nom ?? null,
            prenom: data.prenom ?? null,
            email: data.email ?? emailFromAuth ?? null,
            refuserPartage: data.refuserPartage ?? null,
          } as Professeur;
        }

        return {
          user_id: userId,
          email: emailFromAuth ?? null,
          nom: null,
          prenom: null,
          code: null,
          refuserPartage: null,
        } as Professeur;
      } catch (e) {
        console.error("Exception fetchProfesseurFromSupabase :", e);
        return {
          user_id: userId,
          email: emailFromAuth ?? null,
          nom: null,
          prenom: null,
          code: null,
          refuserPartage: null,
        } as Professeur;
      }
    },
    []
  );

  const handleDeconnexion = React.useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: "local" as any });
    } catch (e) {
      console.warn("supabase.auth.signOut error:", (e as any)?.message ?? e);
    }

    await storage.multiRemove([
      LS_LAST_MODE,
      LS_LAST_PAGE_PROF,
      LS_LAST_PAGE_ELEVE,
      LS_ELEVE_CACHE,
    ]);

    setProfesseur(null);
    setEleve(null);
    setSelectedGroup(null);
    setParcoursId(null);
    setModeConnexion("accueil");
    setPage("accueil");
    setRecoveryErrorMessage("");
    clearRecoveryFlag();

    await storage.set(LS_LAST_MODE, "accueil");
  }, []);

  const handleSelectGroupForStudents = (group: SelectedGroup) => {
    setSelectedGroup(group);
    setNormalizedPage("GestionEleves");
  };

  useEffect(() => {
    let alive = true;

    const clearRecoveryUrl = () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {}
      }
    };

    const enterRecoveryFlow = async () => {
      if (!alive) return;

      setRecoveryFlag();
      setRecoveryErrorMessage("");
      setProfesseur(null);
      setEleve(null);
      setModeConnexion("accueil");
      setPage("MotDePasseByMail");
      setChargementInitial(false);

      clearRecoveryUrl();
      await storage.set(LS_LAST_MODE, "accueil");
    };

    const enterRecoveryErrorFlow = async (message: string) => {
      if (!alive) return;

      clearRecoveryFlag();
      setRecoveryErrorMessage(message);
      setProfesseur(null);
      setEleve(null);
      setModeConnexion("accueil");
      setPage("MotDePasseOublie");
      setChargementInitial(false);

      clearRecoveryUrl();
      await storage.set(LS_LAST_MODE, "accueil");
    };

    const restore = async () => {
      setChargementInitial(true);

      const recoveryInfo = getRecoveryInfoFromUrl();
      const recoveryActive = recoveryInfo.isRecovery || hasRecoveryFlag();

      if (recoveryInfo.isError) {
        const msg =
          recoveryInfo.errorCode === "otp_expired"
            ? "Le lien de réinitialisation est expiré ou déjà utilisé. Veuillez demander un nouveau mail."
            : recoveryInfo.errorDescription
              ? decodeURIComponent(recoveryInfo.errorDescription.replace(/\+/g, " "))
              : "Le lien de réinitialisation est invalide. Veuillez demander un nouveau mail.";

        await enterRecoveryErrorFlow(msg);
        return;
      }

      if (recoveryActive) {
        await enterRecoveryFlow();
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const userId = session?.user?.id ?? null;
        const email = session?.user?.email ?? null;

        if (alive && userId) {
          const profComplet = await fetchProfesseurFromSupabase(userId, email);
          if (!alive) return;

          setProfesseur(profComplet);
          setEleve(null);
          setModeConnexion("prof");

          const lastRaw = await storage.get(LS_LAST_PAGE_PROF);
          const last = lastRaw ? normalizePage(lastRaw) : null;

          setPage(last && ALL_KNOWN_PAGES.has(last) ? last : "AccueilProf");
          setChargementInitial(false);
          return;
        }
      } catch (e) {
        console.error("Erreur restauration session prof :", e);
      }

      try {
        const lastMode = ((await storage.get(LS_LAST_MODE)) || "accueil") as Mode;
        const lastElevePageRaw = await storage.get(LS_LAST_PAGE_ELEVE);
        const lastElevePage = lastElevePageRaw ? normalizePage(lastElevePageRaw) : null;

        const shouldRestoreEleve =
          lastMode === "eleve" ||
          (lastElevePage ? ELEVE_PAGES.has(lastElevePage) : false);

        if (shouldRestoreEleve) {
          const raw = await storage.get(LS_ELEVE_CACHE);
          if (raw) {
            const cached = JSON.parse(raw) as EleveType;
            if (cached && (cached.id || cached.code || cached.uuid)) {
              if (!alive) return;
              setEleve(cached);
              setProfesseur(null);
              setModeConnexion("eleve");
              setPage(
                lastElevePage && ALL_KNOWN_PAGES.has(lastElevePage)
                  ? lastElevePage
                  : "AccueilEleve"
              );
              setChargementInitial(false);
              return;
            }
          }
        }
      } catch (e) {
        console.error("Erreur restauration session élève :", e);
      }

      if (!alive) return;
      setProfesseur(null);
      setEleve(null);
      setModeConnexion("accueil");
      setPage("accueil");
      await storage.set(LS_LAST_MODE, "accueil");
      setChargementInitial(false);
    };

    restore();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (!alive) return;

      if (event === "PASSWORD_RECOVERY") {
        await enterRecoveryFlow();
        return;
      }

      if (event === "SIGNED_OUT") {
        clearRecoveryFlag();
        restore();
        return;
      }

      if (hasRecoveryFlag() && event === "SIGNED_IN") {
        await enterRecoveryFlow();
        return;
      }

      restore();
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, [fetchProfesseurFromSupabase]);

  useEffect(() => {
    if (professeur) storage.set(LS_LAST_PAGE_PROF, normalizePage(page));
  }, [page, professeur]);

  useEffect(() => {
    if (eleve) storage.set(LS_LAST_PAGE_ELEVE, normalizePage(page));
  }, [page, eleve]);

  useEffect(() => {
    const fetchStudentParcours = async () => {
      if (eleve && modeConnexion === "eleve") {
        const gid = eleve.group_id ?? null;
        if (!gid) {
          setParcoursGlobaux([]);
          return;
        }

        try {
          const { data, error } = await supabase
            .from("parcours")
            .select("*")
            .contains("groupes_associes", [gid]);

          if (error) {
            setParcoursGlobaux([]);
            return;
          }

          setParcoursGlobaux(data || []);
        } catch {
          setParcoursGlobaux([]);
        }
      }
    };

    fetchStudentParcours();
  }, [eleve, modeConnexion]);

  const FallbackScreen = ({
    title,
    message,
    onPrimaryPress,
    primaryLabel,
    showBottomBar = false,
  }: {
    title: string;
    message: string;
    onPrimaryPress: () => void;
    primaryLabel: string;
    showBottomBar?: boolean;
  }) => (
    <View style={{ flex: 1, backgroundColor: "#0b1220" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>
          {title}
        </Text>
        <Text style={{ color: "#cbd5e1", fontSize: 15, textAlign: "center", marginBottom: 18, lineHeight: 22 }}>
          {message}
        </Text>
        <TouchableOpacity
          onPress={onPrimaryPress}
          style={{
            backgroundColor: "#2563eb",
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>

      {showBottomBar && professeur && modeConnexion === "prof" && (
        <BottomBar
          currentPage={pageToTabId(page)}
          onNavigate={(tabId) => setNormalizedPage(tabIdToPage(tabId))}
          emitTabId
        />
      )}
    </View>
  );

  const isKnownPage = ALL_KNOWN_PAGES.has(page);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0b1220" }}>
        {chargementInitial ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "white", marginTop: 8 }}>Chargement…</Text>
          </View>
        ) : (
          <Suspense
            fallback={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: "white", marginTop: 8 }}>Chargement de la page…</Text>
              </View>
            }
          >
            <View style={{ flex: 1 }}>
              {!isKnownPage && (
                <FallbackScreen
                  title="Page introuvable"
                  message={`La page "${String(page)}" n'est pas reconnue.`}
                  onPrimaryPress={() =>
                    setNormalizedPage(professeur ? "AccueilProf" : eleve ? "AccueilEleve" : "accueil")
                  }
                  primaryLabel="Revenir à l'accueil"
                  showBottomBar={!!professeur}
                />
              )}

              {isKnownPage && page === "MotDePasseByMail" && (
                <MotDePasseByMail setPage={goStr} supabase={supabase} />
              )}

              {isKnownPage && modeConnexion === "accueil" && !professeur && !eleve && page === "accueil" && (
                <ParcoursPlus
                  setPage={goStr}
                  setModeConnexion={setModeConnexion}
                  setEleve={(e) => setEleveAndCache(e as EleveType | null)}
                />
              )}

              {isKnownPage && modeConnexion === "accueil" && page === "CreationCompteProf" && (
                <CreationCompteProf
                  setPage={goStr}
                  setModeConnexion={setModeConnexion}
                  newProfName={newProfName}
                  setNewProfName={setNewProfName}
                  newProfPrenom={newProfPrenom}
                  setNewProfPrenom={setNewProfPrenom}
                  newProfEmail={newProfEmail}
                  setNewProfEmail={setNewProfEmail}
                  newProfCode={newProfCode}
                  setNewProfCode={setNewProfCode}
                  newProfPassword={newProfPassword}
                  setNewProfPassword={setNewProfPassword}
                  newProfPasswordConfirm={newProfPasswordConfirm}
                  setNewProfPasswordConfirm={setNewProfPasswordConfirm}
                  professeurs={professeurs as any}
                  genererCodeUnique={(liste: any[]) => {
                    const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    let code = "";
                    do {
                      const len = Math.floor(Math.random() * 3) + 8;
                      code = Array.from({ length: len })
                        .map(() => lettres[Math.floor(Math.random() * lettres.length)])
                        .join("");
                    } while (liste?.some?.((p: any) => p.code === code));
                    return code;
                  }}
                  setCodeValidationEnvoye={setCodeValidationEnvoye}
                  supabase={supabase}
                />
              )}

              {isKnownPage && modeConnexion === "accueil" && page === "MotDePasseOublie" && (
                <MotDePasseOublie
                  setPage={goStr}
                  setModeConnexion={setModeConnexion}
                  supabase={supabase}
                  initialErrorMessage={recoveryErrorMessage}
                />
              )}

              {isKnownPage && modeConnexion === "accueil" && page === "NouveauMotDePasse" && (
                <NouveauMotDePasse setPage={goStr} supabase={supabase} />
              )}

              {isKnownPage && professeur && modeConnexion === "prof" && PROF_TAB_PAGES.has(page) && (
                <View style={{ flex: 1 }}>
                  {page === "AccueilProf" && (
                    <AccueilProf
                      setPage={goStr}
                      professeur={professeur}
                      handleDeconnexion={handleDeconnexion}
                    />
                  )}

                  {page === "gestionGroupes" && (
                    <GestionGroupes
                      setPage={goStr}
                      professeur={professeur}
                      setProfesseur={setProfesseur as any}
                      setModeConnexion={setModeConnexion as any}
                      setSelectedGroupUuid={handleSelectGroupForStudents as any}
                    />
                  )}

                  {page === "gestionBalises" && (
                    <GestionBalises setPage={goStr} professeur={professeur} />
                  )}

                  {page === "gestionParcours" && (
                    <GestionParcours setPage={goStr} />
                  )}

                  {page === "GestionResultats" && (
                    <GestionResultats setPage={goStr} />
                  )}

                  <BottomBar
                    currentPage={pageToTabId(page)}
                    onNavigate={(tabId) => setNormalizedPage(tabIdToPage(tabId))}
                    emitTabId
                  />
                </View>
              )}

              {isKnownPage && professeur && modeConnexion === "prof" && !PROF_TAB_PAGES.has(page) && (
                <>
                  {page === "Parametres" && (
                    <Parametres
                      professeur={professeur}
                      setProfesseur={setProfesseur}
                      supabase={supabase}
                      setPage={goStr}
                    />
                  )}

                  {page === "NouveauMotDePasse" && (
                    <NouveauMotDePasse setPage={goStr} supabase={supabase} />
                  )}

                  {page === "Association" && (
                    <Association setPage={goStr} professeur={professeur} />
                  )}

                  {page === "GestionEleves" && selectedGroup && (
                    <GestionEleves
                      setPage={goStr}
                      professeur={professeur}
                      setModeConnexion={setModeConnexion}
                      selectedGroup={selectedGroup}
                    />
                  )}

                  {page === "GestionEleves" && !selectedGroup && (
                    <FallbackScreen
                      title="Aucun groupe sélectionné"
                      message="Sélectionne un groupe depuis « Gestion des groupes » pour voir ou ajouter des élèves."
                      onPrimaryPress={() => setNormalizedPage("gestionGroupes")}
                      primaryLabel="Retour à la gestion des groupes"
                      showBottomBar
                    />
                  )}

                  {page === "CreationBalise" && (
                    <CreationBalise setPage={goStr} />
                  )}

                  {page === "BaliseCode" && <BaliseCode setPage={goStr} />}
                  {page === "BaliseTableau" && <BaliseTableau setPage={goStr} />}
                  {page === "BaliseQRcode" && <BaliseQRcode setPage={goStr} />}
                  {page === "BalisePoincon" && <BalisePoincon setPage={goStr} />}

                  {page === "CreerUnNouveauParcours" && (
                    <CreerUnNouveauParcours
                      setPage={goStr}
                      professeur={professeur}
                    />
                  )}

                  {page === "CreerJeuDesErreurs" && (
                    <CreerJeuDesErreurs
                      setPage={goStr}
                    />
                  )}

                  {page === "ModifierUnParcours" && (
                    <ModifierUnParcours
                      setPage={goStr}
                      professeur={professeur}
                      parcoursId={parcoursId}
                    />
                  )}

                  {page === "MesParcours" && (
                    <MesParcours
                      setPage={goStr}
                      professeur={professeur}
                      setParcoursId={setParcoursId}
                    />
                  )}

                  {page === "GestionResultatsTentatives" && (
                    <GestionResultatsTentatives setPage={goStr} professeur={professeur} />
                  )}

                  {page === "GestionResultatsProgressivite" && (
                    <GestionResultatsProgressivite setPage={goStr} professeur={professeur} />
                  )}

                  {page === "GestionPoints" && (
                    <GestionPoints setPage={goStr} professeur={professeur} />
                  )}

                  {page === "PartageParcours" && (
                    <PartageParcours setPage={goStr} professeur={professeur} />
                  )}

                  {page === "configurationPersonnalisee" && (
                    <ConfigurationPersonnalisee setPage={goStr} />
                  )}

                  {page === "gestionResultatsTentatives_parcours" && (
                    <GestionResultatsTentatives setPage={goStr} professeur={professeur} />
                  )}

                  {!PROF_EXTRA_PAGES.has(page) && (
                    <FallbackScreen
                      title="Page professeur introuvable"
                      message={`La page "${String(page)}" n'a pas de rendu prévu dans l'espace professeur.`}
                      onPrimaryPress={() => setNormalizedPage("AccueilProf")}
                      primaryLabel="Retour à l'accueil"
                      showBottomBar
                    />
                  )}
                </>
              )}

              {isKnownPage && eleve && modeConnexion === "eleve" && (
                <>
                  {page === "AccueilEleve" && (
                    <AccueilEleve
                      setPage={goStr}
                      eleveConnecte={eleve}
                      handleDeconnexion={handleDeconnexion}
                    />
                  )}

                  {page === "ClassementEleve" && (
                    <ClassementEleve setPage={goStr} />
                  )}

                  {page === "EcrireResultat" && (
                    <EcrireResultat
                      setPage={goStr}
                      eleveConnecte={eleve}
                      parcoursGlobaux={parcoursGlobaux}
                      dossiersParcours={dossiersParcours}
                      setParcoursActif={setParcoursActif}
                    />
                  )}

                  {page === "EcrireCodeBaliseEleve" && (
                    <EcrireCodeBaliseEleve
                      setPage={goStr}
                      eleveConnecte={eleve}
                      parcoursActif={parcoursActif}
                    />
                  )}

                  {page === "Jeudeserreurs" && (
                    <Jeudeserreurs
                      setPage={goStr}
                    />
                  )}

                  {page === "StatistiquesEleve" && (
                    <ClassementEleve setPage={goStr} />
                  )}

                  {page === "ObjectifsEleve" && (
                    <ObjectifsEleve
                      setPage={goStr}
                      eleveNom={eleve.display_name || "Élève"}
                    />
                  )}

                  {!ELEVE_PAGES.has(page) && (
                    <FallbackScreen
                      title="Page élève introuvable"
                      message={`La page "${String(page)}" n'a pas de rendu prévu dans l'espace élève.`}
                      onPrimaryPress={() => setNormalizedPage("AccueilEleve")}
                      primaryLabel="Retour à l'accueil élève"
                    />
                  )}
                </>
              )}

              {isKnownPage &&
                !(
                  page === "MotDePasseByMail" ||
                  ((modeConnexion === "accueil" && !professeur && !eleve && PUBLIC_PAGES.has(page)) ||
                    (professeur && modeConnexion === "prof") ||
                    (eleve && modeConnexion === "eleve"))
                ) && (
                  <FallbackScreen
                    title="Navigation incohérente"
                    message="L'application a détecté un état de navigation incohérent."
                    onPrimaryPress={() => {
                      if (professeur) setNormalizedPage("AccueilProf");
                      else if (eleve) setNormalizedPage("AccueilEleve");
                      else setNormalizedPage("accueil");
                    }}
                    primaryLabel="Revenir à l'accueil"
                    showBottomBar={!!professeur}
                  />
                )}
            </View>
          </Suspense>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}