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
  name?: string | null;
  nom?: string | null;

  // Mode groupe
  isGroupSession?: boolean;
  groupSessionId?: string | null;
  groupSessionCode?: string | null;
  groupSessionName?: string | null;
  groupStudents?: EleveType[];
  targetStudentIds?: string[];
  groupIds?: string[];
};

type GroupSessionRow = {
  id: string;
  code: string;
  nom?: string | null;
  teacher_id?: string | null;
  student_ids?: string[] | null;
};

type Props = {
  setPage: (p: PageType) => void;
  setModeConnexion: (m: "accueil" | "prof" | "eleve") => void;
  setProfesseur?: (p: any) => void;
  setEleve: (e: EleveType | null) => void;
};

/* ============================================================
   Helpers "doublés" RPC -> fallback tables
   ============================================================ */
async function getProfUserIdByCode(code: string): Promise<string | null> {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;

  let r = await supabase.rpc("validate_prof_code", { p_code: upper });
  if (!r.error && r.data) {
    const uid = extractUserId(r.data);
    if (uid) return uid;
  }

  r = await supabase.rpc("validate_professeur_code", { code: upper });
  if (!r.error && r.data) {
    const uid = extractUserId(r.data);
    if (uid) return uid;
  }

  const sel = await supabase
    .from("professeurs")
    .select("user_id")
    .eq("code", upper)
    .maybeSingle<any>();

  if (!sel.error && sel.data?.user_id) return sel.data.user_id as string;

  return null;
}

async function getStudentByCode(
  code: string,
  teacherId?: string | null
): Promise<{ id: string; name: string | null; group_id: string | null; code?: string | null } | null> {
  const c = code.trim();
  if (!c) return null;

  let r = await supabase.rpc("student_name_by_code", { p_code: c });
  if (!r.error && r.data) {
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (row?.id) {
      return {
        id: row.id,
        name: row?.name ?? null,
        group_id: row?.group_id ?? null,
        code: row?.code ?? c,
      };
    }
  }

  let query = supabase
    .from("students")
    .select("id,name,group_id,code,teacher_id")
    .eq("code", c);

  if (teacherId) query = query.eq("teacher_id", teacherId);

  const sel = await query.maybeSingle<any>();

  if (!sel.error && sel.data?.id) {
    const d = sel.data;
    return {
      id: d.id,
      name: d.name ?? null,
      group_id: d.group_id ?? null,
      code: d.code ?? c,
    };
  }

  return null;
}

async function getGroupSessionByCode(
  code: string,
  teacherId: string
): Promise<GroupSessionRow | null> {
  const c = code.trim().toUpperCase();
  if (!c.startsWith("GR")) return null;

  const { data, error } = await supabase
    .from("GroupeSessionEleves")
    .select("id, code, nom, teacher_id, student_ids")
    .eq("code", c)
    .eq("teacher_id", teacherId)
    .maybeSingle<any>();

  if (error) {
    console.error("Erreur recherche session groupe:", error.message);
    return null;
  }

  if (!data?.id) return null;

  return {
    id: String(data.id),
    code: String(data.code ?? c),
    nom: data.nom ?? null,
    teacher_id: data.teacher_id ?? null,
    student_ids: Array.isArray(data.student_ids) ? data.student_ids.map(String) : [],
  };
}

async function getStudentsByIds(ids: string[], teacherId: string): Promise<EleveType[]> {
  const cleanIds = ids.map(String).filter(Boolean);
  if (cleanIds.length === 0) return [];

  const { data, error } = await supabase
    .from("students")
    .select("id,name,code,group_id,teacher_id")
    .in("id", cleanIds)
    .eq("teacher_id", teacherId);

  if (error) {
    console.error("Erreur chargement élèves session groupe:", error.message);
    return [];
  }

  const rows = (data || []) as any[];

  return rows.map((row) => ({
    uuid: String(row.id),
    id: String(row.id),
    code: row.code ? String(row.code) : undefined,
    teacher_id: row.teacher_id ?? teacherId,
    group_id: row.group_id ?? null,
    display_name: row.name ?? null,
    name: row.name ?? null,
  }));
}

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
    if (typeof raw.id === "string") return raw.id;

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

function normalizeStudentCodeForSearch(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/* ============================================================
   Composant principal
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

  const webVideoRef = useRef<HTMLVideoElement | null>(null);
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
    const c = normalizeStudentCodeForSearch(codeEleve);

    if (!p || !c) {
      setErrorEleve("Renseigne le code professeur et ton code élève ou groupe.");
      return;
    }

    setLoadingEleve(true);
    try {
      const profUserId = await getProfUserIdByCode(p);
      if (!profUserId) {
        setErrorEleve("Le code professeur est invalide.");
        return;
      }

      let payload: EleveType | null = null;

      if (c.startsWith("GR")) {
        const session = await getGroupSessionByCode(c, profUserId);

        if (!session?.id || !Array.isArray(session.student_ids) || session.student_ids.length === 0) {
          setErrorEleve("Code groupe invalide.");
          return;
        }

        const groupStudents = await getStudentsByIds(session.student_ids, profUserId);

        if (groupStudents.length === 0) {
          setErrorEleve("Aucun élève trouvé dans cette session groupe.");
          return;
        }

        const firstStudent = groupStudents[0];
        const groupIds = Array.from(
          new Set(
            groupStudents
              .map((student) => student.group_id)
              .filter(Boolean)
              .map(String)
          )
        );

        payload = {
          uuid: firstStudent.id ?? firstStudent.uuid,
          id: firstStudent.id ?? firstStudent.uuid,
          code: c,
          teacher_id: profUserId,
          group_id: groupIds[0] ?? firstStudent.group_id ?? null,
          display_name: session.nom ?? groupStudents.map((s) => s.display_name ?? s.name ?? "Élève").join(" / "),
          name: session.nom ?? "Session groupe",
          isGroupSession: true,
          groupSessionId: session.id,
          groupSessionCode: session.code,
          groupSessionName: session.nom ?? null,
          groupStudents,
          targetStudentIds: groupStudents
            .map((s) => s.id ?? s.uuid)
            .filter(Boolean)
            .map(String),
          groupIds,
        };
      } else {
        const student = await getStudentByCode(c, profUserId);
        if (!student?.id) {
          setErrorEleve("Code élève invalide.");
          return;
        }

        payload = {
          uuid: student.id,
          id: student.id,
          code: c,
          teacher_id: profUserId,
          group_id: student.group_id ?? null,
          display_name: student.name ?? null,
          isGroupSession: false,
          targetStudentIds: [student.id],
        };
      }

      setPayloadEleve(payload);
      setPhase("playing");

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

  if (mode === "espaceEleve") {
    return (
      <View style={{ flex: 1 }}>
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
                placeholder="Code élève ou groupe (ex : 123456 ou GR123456)"
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={codeEleve}
                onChangeText={(t) => setCodeEleve(t.toUpperCase())}
                autoCapitalize="characters"
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
