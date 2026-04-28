// src/ParcoursPlus.tsx
import React, { useRef, useState } from "react";
import {
  Platform,
  View,
  Text,
  TextInput,
  Pressable,
  ImageBackground,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";

/* ------------ Assets ------------- */
const BG_URL =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Accueil%20Parcours%20Plus.png";
const STUDENT_BG_VIDEO_URL =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/bonhomme%20portail.mp4";

/* ------------ Types ------------- */
type Mode = "accueil" | "espaceProf" | "espaceEleve";
type PageType =
  | "accueil"
  | "AccueilProf"
  | "CreationCompteProf"
  | "MotDePasseOublie"
  | "AccueilEleve";

type EleveType = {
  uuid?: string;
  id?: string;
  code?: string;
  teacher_id?: string | null;
  group_id?: string | null;
  display_name?: string | null;
};

type Props = {
  setPage: (p: PageType) => void;
  setModeConnexion: (m: "accueil" | "prof" | "eleve") => void;
  setProfesseur?: (p: any) => void; // non utilisé ici; laissé pour compat
  setEleve: (e: EleveType | null) => void;
};

/* ============================================================
   Helpers "doublés" RPC -> fallback tables (aucune écriture)
   ============================================================ */
async function getProfUserIdByCode(code: string): Promise<string | null> {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;

  // 1) RPC : validate_prof_code(p_code)
  let r = await supabase.rpc("validate_prof_code", { p_code: upper });
  if (!r.error && r.data) {
    const uid = extractUserId(r.data);
    if (uid) return uid;
  }

  // 2) RPC alternatif (certaines bases) : validate_professeur_code(code)
  r = await supabase.rpc("validate_professeur_code", { code: upper });
  if (!r.error && r.data) {
    const uid = extractUserId(r.data);
    if (uid) return uid;
  }

  // 3) Fallback lecture directe (si RLS autorise la lecture)
  const sel = await supabase
    .from("professeurs")
    .select("user_id")
    .eq("code", upper)
    .maybeSingle<any>();

  if (!sel.error && sel.data?.user_id) return sel.data.user_id as string;

  // sinon, on n’insiste pas
  return null;
}

async function getStudentByCode(
  code: string
): Promise<{ id: string; name: string | null; group_id: string | null } | null> {
  const c = code.trim();
  if (!c) return null;

  // 1) RPC : student_name_by_code(p_code)
  let r = await supabase.rpc("student_name_by_code", { p_code: c });
  if (!r.error && r.data) {
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (row?.id) {
      return {
        id: row.id,
        name: row?.name ?? null,
        group_id: row?.group_id ?? null,
      };
    }
  }

  // 2) Fallback lecture directe (si RLS le permet)
  const sel = await supabase
    .from("students")
    .select("id,name,group_id")
    .eq("code", c)
    .maybeSingle<any>();

  if (!sel.error && sel.data?.id) {
    const d = sel.data;
    return {
      id: d.id,
      name: d.name ?? null,
      group_id: d.group_id ?? null,
    };
  }

  return null;
}

// Essaie d’extraire un user_id depuis n’importe quelle forme de retour RPC
function extractUserId(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;

  if (Array.isArray(raw)) {
    for (const x of raw) {
      const v = extractUserId(x);
      if (v) return v;
    }
    return null;
  }

  if (typeof raw === "object") {
    if (typeof raw.user_id === "string") return raw.user_id;
    if (typeof raw.id === "string") return raw.id; // parfois, le RPC renvoie la ligne

    for (const v of Object.values(raw)) {
      if (typeof v === "string") return v;
      if (typeof v === "object") {
        const deep = extractUserId(v);
        if (deep) return deep;
      }
    }
  }

  return null;
}

/* ============================================================
   Composant principal — React-Native (Expo) cross-platform
   ============================================================ */
export default function ParcoursPlus({
  setPage,
  setModeConnexion,
  setEleve,
}: Props) {
  const [mode, setMode] = useState<Mode>("accueil");

  // PROF
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwdVisible, setPwdVisible] = useState(false);
  const [loadingProf, setLoadingProf] = useState(false);

  // ELEVE
  const [codeProf, setCodeProf] = useState("");
  const [codeEleve, setCodeEleve] = useState("");
  const [showStudentCode, setShowStudentCode] = useState(false);
  const [loadingEleve, setLoadingEleve] = useState(false);
  const [errorEleve, setErrorEleve] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "playing">("form");
  const [payloadEleve, setPayloadEleve] = useState<EleveType | null>(null);

  // Vidéo (web)
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  // Vidéo (natif)
  const nativeVideoRef = useRef<any>(null);
  const ExpoVideo = Platform.OS !== "web" ? require("expo-av").Video : null;

  /* -------------------- Actions -------------------- */
  const handleProfConnection = async () => {
    if (loadingProf) return;
    setLoadingProf(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: pwd,
      });

      if (error || !data?.user) {
        throw new Error(error?.message ?? "Connexion impossible");
      }

      // On laisse App.tsx restaurer l’espace prof
      setModeConnexion("accueil");
      setPage("accueil");
    } catch (e: any) {
      if (Platform.OS === "web") {
        alert(e?.message ?? "Erreur de connexion.");
      }
    } finally {
      setLoadingProf(false);
    }
  };

  const finalizeStudentNavigation = async (p: EleveType | null) => {
    if (p) {
      try {
        await AsyncStorage.setItem("eleveConnecte", JSON.stringify(p));
        console.log("ELEVE STOCKÉ :", p);
      } catch (e) {
        console.log("Erreur stockage élève :", e);
      }

      setModeConnexion("eleve");
      setEleve(p);
    }

    setPage("AccueilEleve");
  };

  const handleEleveConnection = async () => {
    if (loadingEleve || phase === "playing") return;
    setErrorEleve(null);

    const p = codeProf.trim().toUpperCase();
    const c = codeEleve.trim();

    if (!p || !c) {
      setErrorEleve("Renseigne le code professeur et ton code élève.");
      return;
    }

    setLoadingEleve(true);
    try {
      // 1) Prof valide ?
      const profUserId = await getProfUserIdByCode(p);
      if (!profUserId) {
        setErrorEleve("Le code professeur est invalide.");
        return;
      }

      // 2) Élève existant ?
      const student = await getStudentByCode(c);
      if (!student?.id) {
        setErrorEleve("Code élève invalide.");
        return;
      }

      const payload: EleveType = {
        uuid: student.id,
        id: student.id,
        code: c,
        teacher_id: profUserId,
        group_id: student.group_id ?? null,
        display_name: student.name ?? null,
      };

      setPayloadEleve(payload);
      setPhase("playing");

      // 3) Lance la vidéo (sinon navigation directe)
      if (Platform.OS === "web") {
        try {
          await webVideoRef.current?.play();
        } catch {
          await finalizeStudentNavigation(payload);
        }
      } else {
        try {
          await nativeVideoRef.current?.playAsync?.();
        } catch {
          await finalizeStudentNavigation(payload);
        }
      }
    } catch (e: any) {
      setErrorEleve(e?.message || "Erreur inattendue.");
      setPhase("form");
    } finally {
      setLoadingEleve(false);
    }
  };

  /* -------------------- UI -------------------- */

  /** Accueil (choix des espaces) **/
  if (mode === "accueil") {
    return (
      <ImageBackground
        source={{ uri: BG_URL }}
        resizeMode="cover"
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 24,
          justifyContent: "space-between",
        }}
      >
        <View style={{ alignItems: "flex-start", marginTop: 24 }}>
          <Text
            style={{
              fontSize: 44,
              fontWeight: "900",
              color: "white",
              textShadowColor: "rgba(0,0,0,0.6)",
              textShadowOffset: { width: 0, height: 3 },
              textShadowRadius: 8,
            }}
          >
            Parcours+
          </Text>

          <Text style={{ color: "white", opacity: 0.9, marginTop: 6 }}>
            Plateforme numérique pour la course d’orientation
          </Text>
        </View>

        <View style={{ gap: 16, marginBottom: 48 }}>
          <Pressable
            onPress={() => setMode("espaceProf")}
            style={{
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: "center",
              backgroundColor: "rgba(34,197,94,0.85)",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 18 }}>
              👨‍🏫 Espace Professeur
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("espaceEleve")}
            style={{
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: "center",
              backgroundColor: "rgba(99,102,241,0.85)",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 18 }}>
              🎓 Espace Élève
            </Text>
          </Pressable>
        </View>
      </ImageBackground>
    );
  }

  /** Espace Professeur **/
  if (mode === "espaceProf") {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "#111827" }}>
        <Pressable onPress={() => setMode("accueil")} style={{ marginBottom: 12 }}>
          <Text style={{ color: "white" }}>← Retour</Text>
        </Pressable>

        <View
          style={{
            maxWidth: 560,
            width: "100%",
            alignSelf: "center",
            backgroundColor: "rgba(255,255,255,0.08)",
            padding: 16,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
          }}
        >
          <TextInput
            placeholder="Adresse email"
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={{
              color: "white",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 12,
              marginBottom: 12,
            }}
          />

          <View style={{ position: "relative" }}>
            <TextInput
              placeholder="Mot de passe"
              placeholderTextColor="rgba(255,255,255,0.6)"
              secureTextEntry={!pwdVisible}
              value={pwd}
              onChangeText={setPwd}
              style={{
                color: "white",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 12,
              }}
            />
            <Pressable
              onPress={() => setPwdVisible((s) => !s)}
              style={{ position: "absolute", right: 12, top: 12 }}
            >
              <Text style={{ color: "white" }}>{pwdVisible ? "🙈" : "👁️"}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleProfConnection}
            disabled={loadingProf}
            style={{
              marginTop: 16,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: "#10b981",
              alignItems: "center",
              opacity: loadingProf ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>
              {loadingProf ? "Connexion…" : "Connexion prof →"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPage("MotDePasseOublie")}
            style={{ marginTop: 12, alignItems: "center" }}
          >
            <Text style={{ color: "rgba(255,255,255,0.8)" }}>Mot de passe oublié ?</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setPage("CreationCompteProf");
              setModeConnexion("accueil");
            }}
            style={{
              marginTop: 16,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>
              🧑‍🏫 Créer un compte professeur
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /** Espace Élève **/
  if (mode === "espaceEleve") {
    return (
      <View style={{ flex: 1 }}>
        {/* --- Vidéo de fond, en pause tant qu’on est sur le formulaire --- */}
        {Platform.OS === "web" ? (
          <View style={{ position: "absolute", inset: 0 }}>
            <video
              ref={webVideoRef}
              style={{ width: "100%", height: "100%", objectFit: "cover" as any }}
              muted
              playsInline
              preload="auto"
              onEnded={() => {
                void finalizeStudentNavigation(payloadEleve);
              }}
            >
              <source src={STUDENT_BG_VIDEO_URL} type="video/mp4" />
            </video>

            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            />
          </View>
        ) : (
          <View style={{ position: "absolute", inset: 0 }}>
            {ExpoVideo && (
              <ExpoVideo
                ref={nativeVideoRef}
                source={{ uri: STUDENT_BG_VIDEO_URL }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                isLooping={false}
                isMuted
                shouldPlay={false}
                onPlaybackStatusUpdate={(s: any) => {
                  if (s?.didJustFinish) {
                    void finalizeStudentNavigation(payloadEleve);
                  }
                }}
              />
            )}

            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            />
          </View>
        )}

        <View style={{ flex: 1, padding: 16 }}>
          <Pressable onPress={() => setMode("accueil")} style={{ marginBottom: 12 }}>
            <Text style={{ color: "white" }}>← Retour</Text>
          </Pressable>

          <View
            style={{
              maxWidth: 560,
              width: "100%",
              alignSelf: "center",
              backgroundColor: "rgba(255,255,255,0.10)",
              padding: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
              marginTop: 24,
            }}
          >
            <TextInput
              placeholder="Code unique professeur"
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={codeProf}
              onChangeText={(t) => setCodeProf(t.toUpperCase())}
              autoCapitalize="characters"
              style={{
                color: "white",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 12,
                marginBottom: 12,
              }}
              editable={phase !== "playing"}
            />

            <View style={{ position: "relative" }}>
              <TextInput
                placeholder="Code élève"
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={codeEleve}
                onChangeText={setCodeEleve}
                secureTextEntry={!showStudentCode}
                style={{
                  color: "white",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.25)",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
                editable={phase !== "playing"}
              />
              <Pressable
                onPress={() => setShowStudentCode((s) => !s)}
                style={{ position: "absolute", right: 12, top: 12 }}
              >
                <Text style={{ color: "white" }}>
                  {showStudentCode ? "🙈" : "👁️"}
                </Text>
              </Pressable>
            </View>

            {!!errorEleve && (
              <Text style={{ color: "#fecaca", marginTop: 8 }}>{errorEleve}</Text>
            )}

            <Pressable
              onPress={handleEleveConnection}
              disabled={loadingEleve || phase === "playing"}
              style={{
                marginTop: 16,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#6366f1",
                alignItems: "center",
                opacity: loadingEleve || phase === "playing" ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                {loadingEleve
                  ? "Vérification…"
                  : phase === "playing"
                  ? "Lecture…"
                  : "Connexion élève →"}
              </Text>
            </Pressable>

            {phase === "playing" && (
              <Text
                style={{
                  color: "white",
                  opacity: 0.9,
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                Connexion réussie ✨ La porte s’ouvre…
              </Text>
            )}
          </View>

          {phase === "playing" && (
            <View style={{ position: "absolute", right: 16, bottom: 16 }}>
              <Pressable
                onPress={() => {
                  void finalizeStudentNavigation(payloadEleve);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.3)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  PASSER LA VIDÉO
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  return null;
}