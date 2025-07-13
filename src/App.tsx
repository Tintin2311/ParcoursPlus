// Code complet fusionné avec les 371 lignes
// Ce fichier contient la création de groupes, de parcours, le partage, les paramètres, etc.
import "./styles.css";
import ParcoursPlus from "./ParcoursPlus";

import { createClient } from "@supabase/supabase-js";
import { updateDataWithOwner } from "./supabaseFunctions";

const supabaseUrl = "https://aswhubzprehjnunbpkwc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd2h1YnpwcmVoam51bmJwa3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMDg5ODcsImV4cCI6MjA2NzU4NDk4N30.rNsW9i0jxtOxHYsoagVXjqz_yMHmVmKumf8c8LKuB0Q"; // Clé publique (anon)

export const supabase = createClient(supabaseUrl, supabaseKey);

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  UserPlus,
  Check,
  X,
} from "lucide-react";

import emailjs from "emailjs-com";
emailjs.init("lyiZ-6klparD8KCNw"); // ← ta clé publique
// Ajouter ces interfaces au début du fichier, après les imports
interface Partage {
  id: string;
  nom: string;
  type: "dossier" | "parcours";
  date?: number;
  expediteur?: string;
  // Ajoutez d'autres propriétés selon vos besoins
  contenu?: any; // ou un type plus spécifique selon votre structure
}

interface Professeur {
  code: string;
  nom?: string;
  email?: string;
  partagesRecus: Partage[];
  // Ajoutez d'autres propriétés selon votre structure existante
}
function Groupes({
  parcoursGlobaux,
  groupes,
  setGroupes,
  professeurs,
  setProfesseurs,
}) {
  const [nomGroupe, setNomGroupe] = useState("");
  const [eleves, setEleves] = useState([]);
  const [nomEleve, setNomEleve] = useState("");
  const [eleveEditIndex, setEleveEditIndex] = useState(null);
  const [nouveauNomEleve, setNouveauNomEleve] = useState("");
  const [groupeActif, setGroupeActif] = useState(null);
  const [nouveauCodeEleve, setNouveauCodeEleve] = useState("");

  const creerGroupe = () => {
    if (!nomGroupe.trim()) return;
    const nouveau = {
      id: Date.now(),
      nom: nomGroupe.trim(),
      eleves: [],
    };
    setGroupes([...groupes, nouveau]);
    setNomGroupe("");
    setGroupeActif(nouveau.id);
  };

  const genererCode = () => {
    let code;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (groupes.some((g) => g.eleves.some((e) => e.code === code)));
    return code;
  };

  const ajouterEleve = () => {
    if (!nomEleve.trim() || groupeActif === null) return;
    const nouveauxGroupes = groupes.map((g) => {
      if (g.id === groupeActif) {
        return { ...g, eleves: [...g.eleves, nomEleve.trim()] };
      }
      return g;
    });
    setGroupes(nouveauxGroupes);
    setNomEleve("");
  };
}
function genererCodeUnique(professeurs) {
  const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code;
  do {
    const longueur = Math.floor(Math.random() * 3) + 8; // entre 8 et 10
    code = "";
    for (let i = 0; i < longueur; i++) {
      code += lettres[Math.floor(Math.random() * lettres.length)];
    }
  } while (professeurs.some((p) => p.code === code));
  return code;
}
function genererCodeEleveUnique(groupes) {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 chiffres
  } while (groupes.some((g) => g.eleves.some((e) => e.code === code)));
  return code;
}

export default function App() {
  const [page, setPage] = useState("accueil");
  useEffect(() => {
    const hash = window.location.hash; // ex: #access_token=...&type=recovery
    const params = new URLSearchParams(hash.substring(1));
    const type = params.get("type");

    console.log("🔍 Hash détecté :", hash);
    console.log("🔍 Type détecté :", type);

    if (type === "recovery") {
      console.log(
        "✅ Type recovery détecté, redirection vers nouveauMotDePasse"
      );
      setPage("nouveauMotDePasse");
    }
  }, []);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [emailMotDePasseOublie, setEmailMotDePasseOublie] = useState("");
  const [passwordValide, setPasswordValide] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [modifierCode, setModifierCode] = useState(false);
  const [nouveauCodeUnique, setNouveauCodeUnique] = useState("");
  const [messageErreurCode, setMessageErreurCode] = useState("");

  const [professeurs, setProfesseurs] = useState<Professeur[]>([]);
  const [professeur, setProfesseur] = useState<Professeur | null>(null);
  const [parcoursGlobaux, setParcoursGlobaux] = useState<any[]>([]); // À typer selon votre structure
  const [dossiersParcours, setDossiersParcours] = useState<any[]>([]); // À typer selon votre structure

  const [newProfName, setNewProfName] = useState("");
  const [newProfEmail, setNewProfEmail] = useState("");

  const [groupes, setGroupes] = useState([]);
  const [newParcoursNom, setNewParcoursNom] = useState("");
  const [nombreBalises, setNombreBalises] = useState(0);
  const [nomExpediteurPartage, setNomExpediteurPartage] = useState("");
  const [parcoursActif, setParcoursActif] = useState(null);
  const [resultatsEleves, setResultatsEleves] = useState([]);
  // Format: [{ eleveCode, parcoursId, essais: n }]
  const [parcoursTerminesEleves, setParcoursTerminesEleves] = useState([]);
  const [ongletResultats, setOngletResultats] = useState("tentatives"); // "tentatives" ou "progressivite"
  const [affichageResultat, setAffichageResultat] = useState(false);
  const [balisesGlobales, setBalisesGlobales] = useState<{ code: string }[]>(
    []
  );
  const [session, setSession] = useState(null);

  const [balisesTemp, setBalisesTemp] = useState([]);
  const [emailPartage, setEmailPartage] = useState("");
  const [parcoursSelectionnes, setParcoursSelectionnes] = useState([]);
  const [partagesRecus, setPartagesRecus] = useState([]);
  const [renommerParcoursRecu, setRenommerParcoursRecu] = useState({});
  const [refuserPartage, setRefuserPartage] = useState(false);
  const [codeProfEleve, setCodeProfEleve] = useState("");
  const [codeEleve, setCodeEleve] = useState("");
  const [eleveConnecte, setEleveConnecte] = useState(null); // objet { nom, code }
  const [modeConnexion, setModeConnexion] = useState("accueil"); // "accueil", "prof", "eleve"
  const [newProfPrenom, setNewProfPrenom] = useState("");
  const [newProfPassword, setNewProfPassword] = useState("");
  const [newProfPasswordConfirm, setNewProfPasswordConfirm] = useState("");
  const [codeValidationEnvoye, setCodeValidationEnvoye] = useState("");
  const [codeEntreParLeProf, setCodeEntreParLeProf] = useState("");
  const [nomGroupe, setNomGroupe] = useState("");
  const [nomEleve, setNomEleve] = useState("");
  const [groupeActif, setGroupeActif] = useState(null);
  const [groupeTemporaire, setGroupeTemporaire] = useState(null);
  const [groupeCree, setGroupeCree] = useState(false);
  const [editParcoursId, setEditParcoursId] = useState(null);
  const termine = false; // temporairement
  const partages: any[] = []; // ou le typage correct selon ton projet

  const [ongletPartage, setOngletPartage] = useState("envoyer");
  // "envoyer" ou "recevoir"
  const [eleveActif, setEleveActif] = useState<EleveType | null>(null);
  type EleveType = {
    nom: string;
    code: string;
    // ajouter d'autres propriétés selon tes besoins
  };

  useEffect(() => {
    const restaurerSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        const userId = data.session.user.id;
        // Aller chercher le professeur lié à ce user_id
        const { data: prof, error: profError } = await supabase
          .from("professeurs")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (prof) {
          setProfesseur(prof);
          setModeConnexion("prof");
          setPage("accueil");
          console.log("✅ Session restaurée automatiquement");
        } else {
          console.log("❌ Aucun professeur lié à cet user_id");
        }
      }
    };
    restaurerSession();
  }, []);
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));

    if (params.get("type") === "recovery") {
      console.log("🔑 Lien de récupération détecté");
      setPage("nouveauMotDePasse");
    }
  }, []);
  const [dossiersGroupes, setDossiersGroupes] = useState([]); // Chaque dossier aura {id, nom, groupes: [ids]}
  const [nouveauNomDossier, setNouveauNomDossier] = useState("");
  const [codeProfesseurDestinataire, setCodeProfesseurDestinataire] =
    useState("");
  const [elementsAEnvoyer, setElementsAEnvoyer] = useState([]); // pour stocker les dossiers/parcours sélectionnés
  const [modeCreationBalises, setModeCreationBalises] = useState<
    "manuel" | "automatique" | null
  >(null);
  const [modeCreationParcoursParDefaut, setModeCreationParcoursParDefaut] =
    useState(null); // "manuel", "automatique" ou null

  const [dossierSelectionPourAjout, setDossierSelectionPourAjout] =
    useState(null);
  const [
    dossierSelectionPourAjoutParcours,
    setDossierSelectionPourAjoutParcours,
  ] = useState(null);
  const [baremeEvaluation, setBaremeEvaluation] = useState([
    { type: "=", tentatives: 1, couleur: "green" },
    { type: "=", tentatives: 2, couleur: "yellow" },
    { type: "=", tentatives: 3, couleur: "orange" },
    { type: "≥", tentatives: 4, couleur: "red" },
  ]);

  const handleConnexion = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim().toLowerCase(),
      password: loginPassword,
    });

    if (error) {
      alert("Email ou mot de passe incorrect.");
      console.error(error);
    } else {
      setSession(data.session); // ✅ met à jour le parent
      alert("Connexion réussie !");
    }
  };
  async function creerCompteProfesseur() {
    const password = newProfPassword;
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
    if (!regex.test(password)) {
      alert(
        "Le mot de passe doit contenir au moins 6 caractères, une majuscule, un chiffre et un symbole."
      );
      return;
    }
    if (newProfPassword !== newProfPasswordConfirm) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }
    const emailExistant = professeurs.some(
      (p) => p.email === newProfEmail.trim().toLowerCase()
    );
    if (emailExistant) {
      alert("Un compte existe déjà avec cette adresse email.");
      return;
    }

    const codeGenere = genererCodeUnique(professeurs);
    const codeConfirmation = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    setCodeValidationEnvoye(codeConfirmation);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newProfEmail.trim().toLowerCase(),
      password: newProfPassword,
    });
    if (authError) {
      alert("Erreur de création de compte: " + authError.message);
      return;
    }

    const nouveauProf = {
      user_id: authData.user.id, // <-- clé pour retrouver le professeur automatiquement
      nom: newProfName,
      prenom: newProfPrenom,
      email: newProfEmail.trim().toLowerCase(),
      code: codeGenere,
      parametres: {},
      refuserPartage: false,
      partagesRecus: [],
    };

    try {
      const { data, error } = await supabase
        .from("professeurs")
        .insert([nouveauProf])
        .select();

      if (error) {
        console.error(error);
        alert(
          "❌ Erreur lors de la création du compte Supabase : " + error.message
        );
        return;
      }

      console.log("✅ Compte professeur créé dans Supabase :", data);

      // Envoi du mail de confirmation
      emailjs
        .send(
          "service_6dkmtzr",
          "template_g1aj6kg",
          {
            to_email: newProfEmail,
            confirmation_code: codeConfirmation,
          },
          "lyiZ-6klparD8KCNw"
        )
        .then(() => {
          console.log("✅ Email envoyé !");
        })
        .catch((error) => {
          console.error("❌ Erreur envoi email", error);
        });

      setPage("confirmationEmail");
    } catch (err) {
      console.error("❌ Erreur inattendue :", err);
      alert("❌ Une erreur inattendue est survenue.");
    }
  }
  const [prendEnCompteTentatives, setPrendEnCompteTentatives] = useState(true);

  const [priseEnCompteTentatives, setPriseEnCompteTentatives] = useState(true);
  const [modePoints, setModePoints] = useState("cumul"); // "cumul", "parParcours", "parTentatives", "personnalise"
  const [baremePointsGlobal, setBaremePointsGlobal] = useState({
    pointsParParcours: 0,
    baremeTentatives: [],
  });
  const [baremePointsParcours, setBaremePointsParcours] = useState({});
  const [parametresProf, setParametresProf] = useState({
    modeCreationParcours: null, // "manuel" | "automatique" | null
  });

  // 2️⃣ Effet pour appliquer automatiquement le mode de création de parcours selon les paramètres prof
  useEffect(() => {
    if (
      page === "CreerUnNouveauParcours" && // si on est sur la page de création de parcours
      !modeCreationBalises && // si aucun mode choisi manuellement
      parametresProf?.modeCreationParcours // si le prof a paramétré "manuel" ou "automatique"
    ) {
      setModeCreationBalises(parametresProf.modeCreationParcours); // applique automatiquement le mode
    }
  }, [page, parametresProf, modeCreationBalises]);

  const groupeEstDansUnAutreDossier = (idGroupe) => {
    return dossiersGroupes.some((d) => d.groupes.includes(idGroupe));
  };

  const parcoursEstDansUnAutreDossierParcours = (idParcours) => {
    return dossiersParcours.some((d) => d.parcours.includes(idParcours));
  };

  const creerParcours = () => {
    if (!newParcoursNom.trim() || balisesTemp.length !== nombreBalises) {
      alert("Veuillez remplir correctement le formulaire.");
      return;
    }

    const nomNormalise = newParcoursNom.trim().toLowerCase();

    const existeDeja = parcoursGlobaux.some(
      (p) =>
        p.nom.trim().toLowerCase() === nomNormalise && p.id !== editParcoursId
    );

    if (existeDeja) {
      alert(
        "❌ Un parcours avec ce nom existe déjà. Veuillez choisir un autre nom."
      );
      return;
    }

    if (editParcoursId) {
      // Si on modifie un parcours existant
      setParcoursGlobaux(
        parcoursGlobaux.map((p) =>
          p.id === editParcoursId
            ? { ...p, nom: newParcoursNom, balises: balisesTemp }
            : p
        )
      );
      setEditParcoursId(null); // Réinitialise après modification
    } else {
      // Sinon on en crée un nouveau
      setParcoursGlobaux([
        ...parcoursGlobaux,
        {
          id: Date.now(),
          nom: newParcoursNom,
          balises: balisesTemp,
          groupesAssocies: [],
        },
      ]);
    }
    alert(`✅ "${newParcoursNom}" validé.`);

    // ✅ Demander si l’utilisateur souhaite créer un autre parcours
    if (confirm("Souhaitez-vous créer un autre parcours ?")) {
      // Reset complet en sortant puis revenant pour forcer le rechargement clean
      setPage("temporaire");
      setTimeout(() => {
        setNewParcoursNom("");
        setNombreBalises(0);
        setBalisesTemp([]);
        setModeCreationBalises(null);
        setPage("CreerUnNouveauParcours");
      }, 50);
    } else {
      // Nettoyage et retour à la gestion des parcours
      setNewParcoursNom("");
      setNombreBalises(0);
      setBalisesTemp([]);
      setModeCreationBalises(null);
      setPage("gestionParcours");
    }
  };
  const handleChangePassword = async () => {
    if (!nouveauPassword.trim()) {
      alert("❌ Merci de saisir un mot de passe.");
      return;
    }

    try {
      const { error: authError } = await supabase.auth.updateUser({
        password: nouveauPassword.trim(),
      });
      if (authError) {
        console.error(authError);
        alert("❌ Erreur Auth : " + authError.message);
        return;
      }

      const updated = await updateDataWithOwner(
        "professeurs",
        { password: nouveauPassword.trim() },
        {}
      );
      if (!updated) {
        alert("❌ Erreur lors de la mise à jour dans la table professeurs.");
        return;
      }

      alert("✅ Mot de passe modifié avec succès !");
      setNouveauPassword("");
      setPage("parametres");
    } catch (error) {
      console.error(error);
      alert("❌ Erreur inattendue : " + error.message);
    }
  };

  const [attribuerPointsParBalise, setAttribuerPointsParBalise] =
    useState(false);

  const creerGroupe = () => {
    if (!nomGroupe.trim()) return;
    const nouveau = {
      id: Date.now(),
      nom: nomGroupe.trim(),
      eleves: [],
    };
    setGroupes([...groupes, nouveau]);
    setNomGroupe("");
    setGroupeActif(nouveau.id);
  };

  const addDossier = (parentId) => {
    const nom = prompt("Nom du dossier :");
    if (!nom) return;

    const nouveauDossier = {
      id: Date.now(),
      nom,
      groupes: [],
      sousDossiers: [],
    };

    if (parentId === null) {
      setDossiersGroupes([...dossiersGroupes, nouveauDossier]);
    } else {
      const ajouterSousDossier = (dossiers) =>
        dossiers.map((d) =>
          d.id === parentId
            ? { ...d, sousDossiers: [...d.sousDossiers, nouveauDossier] }
            : { ...d, sousDossiers: ajouterSousDossier(d.sousDossiers) }
        );
      setDossiersGroupes(ajouterSousDossier(dossiersGroupes));
    }
  };
  const supprimerDossier = (id) => {
    const confirmer = window.confirm(
      "Supprimer ce dossier et ses sous-dossiers ?"
    );
    if (!confirmer) return;

    const supprimerRecursif = (dossiers) =>
      dossiers
        .filter((d) => d.id !== id)
        .map((d) => ({
          ...d,
          sousDossiers: supprimerRecursif(d.sousDossiers),
        }));

    setDossiersGroupes(supprimerRecursif(dossiersGroupes));
  };
  const [nouveauPassword, setNouveauPassword] = useState("");

  const renderDossier = (dossier, niveau = 0) => (
    <div
      key={dossier.id}
      style={{
        marginLeft: `${niveau * 20}px`,
        border: "1px solid #ccc",
        borderRadius: "6px",
        padding: "5px",
        marginTop: "5px",
        background: "#f9f9f9",
      }}
    >
      <strong>{dossier.nom}</strong>
      <button
        onClick={() => addDossier(dossier.id)}
        style={{ marginLeft: "10px" }}
      >
        ➕ Sous-dossier
      </button>
      <button
        onClick={() => supprimerDossier(dossier.id)}
        style={{ marginLeft: "5px", color: "red" }}
      >
        🗑️ Supprimer
      </button>

      {dossier.groupes.map((idGroupe) => {
        const groupe = groupes.find((g) => g.id === idGroupe);
        return (
          <div key={idGroupe} style={{ marginLeft: "15px" }}>
            {groupe ? groupe.nom : "Groupe inconnu"}
          </div>
        );
      })}

      {dossier.sousDossiers.map((sd) => renderDossier(sd, niveau + 1))}
    </div>
  );

  const ajouterEleve = () => {
    if (!nomEleve.trim() || groupeActif === null) return;
    const nouveauxGroupes = groupes.map((g) => {
      if (g.id === groupeActif) {
        return { ...g, eleves: [...g.eleves, nomEleve.trim()] };
      }
      return g;
    });
    setGroupes(nouveauxGroupes);
    setNomEleve("");
  };

  const enregistrerParcoursRecu = (parcours) => {
    const nomFinal =
      (renommerParcoursRecu[parcours.id] || "").trim() || parcours.nom;
    setParcoursGlobaux([...parcoursGlobaux, { ...parcours, nom: nomFinal }]);
    alert(`Parcours "${nomFinal}" enregistré !`);
    setRenommerParcoursRecu((prev) => {
      const updated = { ...prev };
      delete updated[parcours.id];
      return updated;
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1
        style={{ textAlign: "center", fontSize: "2em", marginBottom: "20px" }}
      >
        Parcours +
      </h1>

      {professeur && (
        <>
          <button
            onClick={() => {
              setProfesseur(null);
              setPage("accueil");
              setModeConnexion("accueil");
              setModifierCode(false);
              setMessageErreurCode("");
            }}
            style={{ position: "absolute", top: 10, left: 10 }}
          >
            🚪 Déconnexion
          </button>

          {page === "parametres" || page === "modifierMotDePasse" ? (
            <button
              onClick={() => setPage("accueil")}
              style={{ position: "absolute", top: 10, right: 10 }}
            >
              ⬅️ Retour
            </button>
          ) : (
            <button
              onClick={() => setPage("parametres")}
              style={{ position: "absolute", top: 10, right: 10 }}
            >
              ⚙️ Paramètres
            </button>
          )}

          {/* Affichage du bouton Gestion des groupes UNIQUEMENT si page accueil */}
          {page === "accueil" && (
            <div style={{ marginTop: 60, textAlign: "center" }}>
              <button
                className="bouton-gestion-groupes"
                onClick={() => setPage("gestionGroupes")}
              >
                📂 Gestion des groupes
              </button>
              <br />
              <button
                className="bouton-gestion-groupes"
                onClick={() => setPage("gestionBalises")}
              >
                📌 Gestion des balises
              </button>

              <br />
              <button
                className="bouton-gestion-groupes"
                onClick={() => setPage("gestionParcours")}
              >
                🗺️ Gestion des parcours
              </button>
              <br />
              <button
                className="bouton-gestion-groupes"
                onClick={() => setPage("gestionResultats")}
              >
                📊 Gestion des barèmes
              </button>
            </div>
          )}
        </>
      )}

      {page === "gestionResultats" && (
        <div
          style={{
            textAlign: "center",
            marginTop: "80px",
            padding: "20px",
            maxWidth: "600px",
            margin: "80px auto",
          }}
        >
          <button
            onClick={() => setPage("accueil")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>📊 Gestion des barèmes</h2>
          <p>Sélectionnez le type de barème à gérer :</p>

          <div
            style={{
              marginTop: "30px",
              display: "flex",
              justifyContent: "center",
              gap: "20px",
            }}
          >
            <button
              onClick={() => setPage("gestionResultatsTentatives")}
              style={{
                padding: "12px 20px",
                fontSize: "1.1em",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              📈 Barème tentatives
            </button>
            <button
              onClick={() => setPage("gestionPoints")}
              style={{
                padding: "10px 20px",
                backgroundColor:
                  page === "gestionPoints" ? "#4CAF50" : "#f0f0f0",
                color: page === "gestionPoints" ? "white" : "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              🏆 Mode d'attribution des points
            </button>
            <button
              onClick={() => setPage("gestionResultatsProgressivite")}
              style={{
                padding: "12px 20px",
                fontSize: "1.1em",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              🔄 Progressivité
            </button>
          </div>
        </div>
      )}
      {page === "gestionResultatsTentatives" && (
        <div
          style={{
            textAlign: "center",
            marginTop: "80px",
            padding: "20px",
            maxWidth: "600px",
            marginInline: "auto",
          }}
        >
          <button
            onClick={() => setPage("gestionResultats")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>📊 Gestion des résultats - Barème selon tentatives</h2>
          <p>
            Modifiez le barème d'attribution des couleurs et des points selon le
            nombre de tentatives :
          </p>

          <div style={{ textAlign: "left", marginTop: "20px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              <input
                type="checkbox"
                checked={!prendEnCompteTentatives}
                onChange={(e) => setPrendEnCompteTentatives(!e.target.checked)}
              />
              Ne pas prendre en compte le nombre de tentatives
            </label>

            {prendEnCompteTentatives &&
              baremeEvaluation.map((bareme, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "10px",
                    gap: "10px",
                    flexWrap: "wrap",
                    padding: "10px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background: "#f9f9f9",
                  }}
                >
                  <label>Condition :</label>
                  <select
                    value={bareme.type}
                    onChange={(e) => {
                      const newBareme = [...baremeEvaluation];
                      newBareme[index].type = e.target.value;
                      if (e.target.value === "entre") {
                        newBareme[index].minTentatives = 1;
                        newBareme[index].maxTentatives = 2;
                        delete newBareme[index].tentatives;
                      } else {
                        newBareme[index].tentatives = 1;
                        delete newBareme[index].minTentatives;
                        delete newBareme[index].maxTentatives;
                      }
                      setBaremeEvaluation(newBareme);
                    }}
                  >
                    <option value="=">=</option>
                    <option value="≥">Minimum</option>
                    <option value="≤">Maximum</option>
                    <option value="entre">Entre</option>
                  </select>

                  {bareme.type === "entre" ? (
                    <>
                      <label>De :</label>
                      <input
                        type="number"
                        min="1"
                        value={bareme.minTentatives ?? ""}
                        onChange={(e) => {
                          const newBareme = [...baremeEvaluation];
                          newBareme[index].minTentatives = parseInt(
                            e.target.value
                          );
                          setBaremeEvaluation(newBareme);
                        }}
                        style={{ width: "70px" }}
                      />
                      <label>à :</label>
                      <input
                        type="number"
                        min="1"
                        value={bareme.maxTentatives ?? ""}
                        onChange={(e) => {
                          const newBareme = [...baremeEvaluation];
                          newBareme[index].maxTentatives = parseInt(
                            e.target.value
                          );
                          setBaremeEvaluation(newBareme);
                        }}
                        style={{ width: "70px" }}
                      />
                    </>
                  ) : (
                    <>
                      <label>Tentatives :</label>
                      <input
                        type="number"
                        min="1"
                        value={bareme.tentatives ?? ""}
                        onChange={(e) => {
                          const newBareme = [...baremeEvaluation];
                          newBareme[index].tentatives = parseInt(
                            e.target.value
                          );
                          setBaremeEvaluation(newBareme);
                        }}
                        style={{ width: "80px" }}
                      />
                    </>
                  )}

                  <label>Couleur :</label>
                  <input
                    type="color"
                    value={bareme.couleur}
                    onChange={(e) => {
                      const newBareme = [...baremeEvaluation];
                      newBareme[index].couleur = e.target.value;
                      setBaremeEvaluation(newBareme);
                    }}
                  />

                  <label>Points :</label>
                  <input
                    type="text"
                    value={
                      bareme.points !== undefined
                        ? bareme.points.toString()
                        : ""
                    }
                    onChange={(e) => {
                      const cleanedValue = e.target.value
                        .replace(",", ".") // Remplace les virgules par des points pour le calcul
                        .replace(/[^0-9.\-]/g, ""); // Garde seulement chiffres, points et tirets

                      const newBareme = [...baremeEvaluation];

                      // Permettre la saisie progressive : vide, tiret seul, ou point décimal en cours
                      if (
                        cleanedValue === "" ||
                        cleanedValue === "-" ||
                        cleanedValue === "." ||
                        cleanedValue === "-." ||
                        cleanedValue.endsWith(".")
                      ) {
                        // Pour l'affichage, on remet le point en virgule
                        newBareme[index].points = cleanedValue.replace(
                          ".",
                          ","
                        );
                      } else {
                        // Sinon on essaie de parser
                        const parsed = parseFloat(cleanedValue);
                        if (isNaN(parsed)) {
                          newBareme[index].points = "";
                        } else {
                          // Convertir en string avec virgule pour l'affichage
                          newBareme[index].points = parsed
                            .toString()
                            .replace(".", ",");
                        }
                      }

                      setBaremeEvaluation(newBareme);
                    }}
                    placeholder="Points"
                    style={{ width: "80px" }}
                  />

                  <button
                    onClick={() => {
                      if (confirm("❌ Supprimer ce barème ?")) {
                        const newBareme = baremeEvaluation.filter(
                          (_, i) => i !== index
                        );
                        setBaremeEvaluation(newBareme);
                      }
                    }}
                    style={{
                      backgroundColor: "red",
                      color: "white",
                      border: "none",
                      padding: "5px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}

            {prendEnCompteTentatives && (
              <div style={{ textAlign: "center", marginTop: "15px" }}>
                <button
                  onClick={() =>
                    setBaremeEvaluation([
                      ...baremeEvaluation,
                      {
                        type: "=",
                        tentatives: 1,
                        couleur: "#000000",
                        points: 0,
                      },
                    ])
                  }
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  ➕ Ajouter une condition
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {page === "gestionPoints" && (
        <div
          style={{ textAlign: "center", marginTop: "80px", padding: "20px" }}
        >
          <button
            onClick={() => setPage("gestionResultats")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>🏆 Choisissez le mode d'attribution des points :</h2>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setModePoints("cumul")}
              style={{
                padding: "10px 20px",
                backgroundColor: modePoints === "cumul" ? "#4CAF50" : "#f0f0f0",
                color: modePoints === "cumul" ? "white" : "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                width: "300px",
              }}
            >
              ➕ Cumul : points par parcours + points selon tentatives
            </button>

            <button
              onClick={() => setModePoints("parParcours")}
              style={{
                padding: "10px 20px",
                backgroundColor:
                  modePoints === "parParcours" ? "#4CAF50" : "#f0f0f0",
                color: modePoints === "parParcours" ? "white" : "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                width: "300px",
              }}
            >
              📋 Points uniquement par parcours
            </button>

            <button
              onClick={() => setModePoints("parTentatives")}
              style={{
                padding: "10px 20px",
                backgroundColor:
                  modePoints === "parTentatives" ? "#4CAF50" : "#f0f0f0",
                color: modePoints === "parTentatives" ? "white" : "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                width: "300px",
              }}
            >
              🎯 Points uniquement selon tentatives
            </button>

            <button
              onClick={() => setModePoints("personnalise")}
              style={{
                padding: "10px 20px",
                backgroundColor:
                  modePoints === "personnalise" ? "#4CAF50" : "#f0f0f0",
                color: modePoints === "personnalise" ? "white" : "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                width: "300px",
              }}
            >
              🎨 Personnaliser par parcours
            </button>
            {modePoints === "personnalise" && (
              <div style={{ marginTop: "10px" }}>
                <button
                  onClick={() => setPage("personnaliserParParcours")}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#2196F3",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  ➡️ Accéder à la personnalisation des parcours
                </button>
              </div>
            )}
          </div>

          {/* Points par parcours */}
          {(modePoints === "cumul" || modePoints === "parParcours") && (
            <div
              style={{
                marginTop: "30px",
                maxWidth: "400px",
                marginInline: "auto",
                textAlign: "left",
              }}
            >
              <h3>📋 Points par parcours validé</h3>
              <label>
                Points par parcours :
                <input
                  type="number"
                  min="0"
                  value={baremePointsGlobal.pointsParParcours}
                  onChange={(e) =>
                    setBaremePointsGlobal({
                      ...baremePointsGlobal,
                      pointsParParcours: parseInt(e.target.value),
                    })
                  }
                  style={{ marginLeft: "10px", width: "80px" }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {page === "motDePasseOublie" ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <button
            onClick={() => {
              setPage("accueil");
              setModeConnexion("accueil");
            }}
            style={{ position: "absolute", top: 10, left: 10 }}
          >
            ⬅️ Retour
          </button>
          <h2>🔐 Récupération du mot de passe</h2>
          <p>
            Entrez votre adresse email pour recevoir un lien de réinitialisation
            de mot de passe.
          </p>
          <input
            type="email"
            placeholder="Votre adresse email"
            value={emailMotDePasseOublie}
            onChange={(e) => setEmailMotDePasseOublie(e.target.value)}
            style={{ width: "300px" }}
          />
          <br />
          <button
            onClick={async () => {
              const email = emailMotDePasseOublie.trim().toLowerCase();
              if (!email) {
                alert("❌ Veuillez entrer une adresse email.");
                return;
              }

              try {
                const { data, error } =
                  await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: "https://x7623y.csb.app",
                  });

                if (error) {
                  console.error(error);
                  alert("❌ Erreur : " + error.message);
                  return;
                }

                alert(
                  "✅ Si un compte existe avec cet email, un lien de réinitialisation a été envoyé."
                );
                setPage("connexion"); // redirige vers la page de connexion
              } catch (err) {
                console.error(err);
                alert("❌ Erreur inattendue : " + err.message);
              }
            }}
            style={{ marginTop: 10 }}
          >
            📩 Envoyer le lien de réinitialisation
          </button>
        </div>
     ) : modeConnexion === "accueil" ? (
  <ParcoursPlus
    modeConnexion={modeConnexion}
    setModeConnexion={setModeConnexion}
    page={page}
    setPage={setPage}
    newProfEmail={newProfEmail}
    setNewProfEmail={setNewProfEmail}
    newProfPassword={newProfPassword}
    setNewProfPassword={setNewProfPassword}
    codeProfEleve={codeProfEleve}
    setCodeProfEleve={setCodeProfEleve}
    codeEleve={codeEleve}
    setCodeEleve={setCodeEleve}
    setProfesseur={setProfesseur}
    setNouveauCodeUnique={setNouveauCodeUnique}
    setEleveConnecte={setEleveConnecte}
    professeurs={professeurs}
    groupes={groupes}
  />

      ) : page === "parametres" ? (
        <div>
          <h2 style={{ textAlign: "center", marginTop: "80px" }}>
            ⚙️ Paramètres
          </h2>

          <p style={{ marginTop: "60px" }}>
            Code unique (6 à 20 caractères) :{" "}
            {!modifierCode ? (
              <>
                <strong>{professeur ? professeur.code : ""}</strong>

                <button
                  style={{ marginLeft: 10 }}
                  onClick={() => {
                    setModifierCode(true);
                    setNouveauCodeUnique(professeur.code);
                  }}
                >
                  ✏️ Modifier le code
                </button>
              </>
            ) : (
              <>
                <input
                  value={nouveauCodeUnique}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    if (code.length > 20) return;
                    setNouveauCodeUnique(code.replace(/[^A-Z0-9]/g, ""));
                  }}
                  maxLength={20}
                  style={{ textTransform: "uppercase" }}
                />
                <button
                  onClick={async () => {
                    if (nouveauCodeUnique.length < 6) {
                      setMessageErreurCode(
                        "Le code doit contenir au moins 6 caractères."
                      );
                      return;
                    }

                    const { data, error } = await supabase
                      .from("professeurs")
                      .select("*")
                      .eq("code", nouveauCodeUnique);

                    if (error) {
                      console.error(error);
                      setMessageErreurCode(
                        "Erreur lors de la vérification du code."
                      );
                      return;
                    }

                    if (
                      data.length > 0 &&
                      data[0].user_id !== professeur.user_id
                    ) {
                      setMessageErreurCode("Code déjà utilisé !");
                      return;
                    }

                    const { error: updateError } = await supabase
                      .from("professeurs")
                      .update({ code: nouveauCodeUnique })
                      .eq("user_id", professeur.user_id);

                    if (updateError) {
                      console.error(updateError);
                      setMessageErreurCode(
                        "Erreur lors de la mise à jour du code."
                      );
                      return;
                    }

                    const updatedProf = {
                      ...professeur,
                      code: nouveauCodeUnique,
                    };
                    setProfesseur(updatedProf);
                    setModifierCode(false);
                    setMessageErreurCode("");
                    alert("✅ Code unique mis à jour avec succès !");
                  }}
                  style={{ marginLeft: 10 }}
                >
                  ✅ Valider
                </button>
              </>
            )}
          </p>

          {messageErreurCode && (
            <p style={{ color: "red" }}>{messageErreurCode}</p>
          )}

          <label>
            <input
              type="checkbox"
              checked={professeur.refuserPartage || false}
              onChange={() => {
                const updatedProf = {
                  ...professeur,
                  refuserPartage: !(professeur.refuserPartage || false),
                };
                setProfesseur(updatedProf);
                setProfesseurs(
                  professeurs.map((p) =>
                    p.email === updatedProf.email ? updatedProf : p
                  )
                );
              }}
            />{" "}
            Refuser les partages
          </label>
          <br />
          <button
            onClick={() => setPage("modifierMotDePasse")}
            style={{ marginTop: 10 }}
          >
            🔐 Modifier le mot de passe
          </button>
          <hr style={{ margin: "40px 0" }} />

          <h3 style={{ textAlign: "center" }}>
            ⚙️ Mode de création des parcours
          </h3>
          <p style={{ textAlign: "center" }}>
            Choisissez le mode de création par défaut lors de la création d’un
            parcours :
          </p>
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <label style={{ display: "block", margin: "5px" }}>
              <input
                type="radio"
                name="modeCreationParcours"
                checked={parametresProf.modeCreationParcours === null}
                onChange={() =>
                  setParametresProf({
                    ...parametresProf,
                    modeCreationParcours: null,
                  })
                }
              />{" "}
              ❓ Demander à chaque création
            </label>

            <label style={{ display: "block", margin: "5px" }}>
              <input
                type="radio"
                name="modeCreationParcours"
                checked={parametresProf.modeCreationParcours === "manuel"}
                onChange={() =>
                  setParametresProf({
                    ...parametresProf,
                    modeCreationParcours: "manuel",
                  })
                }
              />{" "}
              ✏️ Toujours en mode manuel
            </label>

            <label style={{ display: "block", margin: "5px" }}>
              <input
                type="radio"
                name="modeCreationParcours"
                checked={parametresProf.modeCreationParcours === "automatique"}
                onChange={() =>
                  setParametresProf({
                    ...parametresProf,
                    modeCreationParcours: "automatique",
                  })
                }
              />{" "}
              ⚡ Toujours en mode automatique
            </label>
          </div>
        </div>
      ) : page === "nouveauMotDePasse" ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <h2>🔐 Définir un nouveau mot de passe</h2>
          <p>Entrez votre nouveau mot de passe ci-dessous.</p>
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={newProfPassword}
            onChange={(e) => setNewProfPassword(e.target.value)}
            style={{ width: "300px", marginBottom: 10 }}
          />
          <br />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={newProfPasswordConfirm}
            onChange={(e) => setNewProfPasswordConfirm(e.target.value)}
            style={{ width: "300px", marginBottom: 10 }}
          />
          <br />
          <button
            onClick={async () => {
              if (newProfPassword !== newProfPasswordConfirm) {
                alert("❌ Les mots de passe ne correspondent pas.");
                return;
              }
              const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
              if (!regex.test(newProfPassword)) {
                alert(
                  "❌ Le mot de passe doit contenir au moins 6 caractères, une majuscule, un chiffre et un symbole."
                );
                return;
              }

              try {
                const {
                  data: { session },
                  error: sessionError,
                } = await supabase.auth.getSession();
                if (sessionError || !session) {
                  alert(
                    "❌ Session invalide ou expirée. Veuillez relancer la récupération de mot de passe."
                  );
                  setPage("connexion");
                  return;
                }

                const { error } = await supabase.auth.updateUser({
                  password: newProfPassword.trim(),
                });

                if (error) {
                  console.error(error);
                  alert(
                    "❌ Erreur lors de la mise à jour du mot de passe : " +
                      error.message
                  );
                  return;
                }
                alert("✅ Mot de passe mis à jour avec succès !");
                setNewProfPassword("");
                setNewProfPasswordConfirm("");
                setPage("connexion"); // retour à la connexion
              } catch (err) {
                console.error(err);
                alert("❌ Erreur inattendue : " + err.message);
              }
            }}
          >
            ✅ Valider le nouveau mot de passe
          </button>
        </div>
      ) : page === "gestionBalises" ? (
        <div
          style={{ textAlign: "center", marginTop: "80px", padding: "20px" }}
        >
          <button
            onClick={() => setPage("accueil")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>📌 Gestion des balises</h2>
          <p>Ajoute rapidement des balises en spécifiant leur code.</p>

          {balisesGlobales.length === 0 && (
            <p style={{ color: "#555" }}>
              Aucune balise enregistrée pour le moment.
            </p>
          )}

          <div
            style={{
              maxWidth: "500px",
              margin: "20px auto",
              textAlign: "left",
            }}
          >
            {balisesGlobales.map((balise, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "10px",
                  gap: "10px",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  background: "#f9f9f9",
                }}
              >
                <span>Balise n° {index + 1} :</span>
                <input
                  placeholder="Code de la balise"
                  value={balise.code}
                  onChange={(e) => {
                    const newBalises = [...balisesGlobales];
                    newBalises[index].code = e.target.value
                      .toUpperCase()
                      .trim();
                    setBalisesGlobales(newBalises);
                  }}
                  style={{ flex: 1, padding: "6px" }}
                />
                <button
                  onClick={() => {
                    if (confirm(`❌ Supprimer la balise n° ${index + 1} ?`)) {
                      setBalisesGlobales(
                        balisesGlobales.filter((_, i) => i !== index)
                      );
                    }
                  }}
                  style={{
                    backgroundColor: "red",
                    color: "white",
                    border: "none",
                    padding: "5px 10px",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() =>
              setBalisesGlobales([...balisesGlobales, { code: "" }])
            }
            style={{
              padding: "10px 20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            ➕ Ajouter une balise
          </button>
        </div>
      ) : page === "creationCompteProf" ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <button
            onClick={() => {
              setPage("accueil");
              setModeConnexion("accueil");
            }}
            style={{ position: "absolute", top: 10, left: 10 }}
          >
            ⬅️ Retour
          </button>
          <h2>🧑‍🏫 Création d’un compte professeur</h2>

          <input
            placeholder="Nom"
            value={newProfName}
            onChange={(e) => setNewProfName(e.target.value)}
          />
          <br />
          <input
            placeholder="Prénom"
            value={newProfPrenom}
            onChange={(e) => setNewProfPrenom(e.target.value)}
          />
          <br />
          <input
            type="email"
            placeholder="Adresse email"
            value={newProfEmail}
            onChange={(e) => setNewProfEmail(e.target.value)}
          />
          <br />
          <input
            type="password"
            placeholder="Mot de passe"
            value={newProfPassword}
            onChange={(e) => setNewProfPassword(e.target.value)}
          />
          <br />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={newProfPasswordConfirm}
            onChange={(e) => setNewProfPasswordConfirm(e.target.value)}
          />
          <br />
          <button
            // Version corrigée du code de création de compte professeur

            onClick={async () => {
              const password = newProfPassword;
              const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
              if (!regex.test(password)) {
                alert(
                  "Le mot de passe doit contenir au moins 6 caractères, une majuscule, un chiffre et un symbole."
                );
                return;
              }
              if (newProfPassword !== newProfPasswordConfirm) {
                alert("Les mots de passe ne correspondent pas.");
                return;
              }
              const emailExistant = professeurs.some(
                (p) => p.email === newProfEmail.trim().toLowerCase()
              );
              if (emailExistant) {
                alert("Un compte existe déjà avec cette adresse email.");
                return;
              }

              try {
                // 1. D'abord créer le compte utilisateur dans Auth
                const { data: authData, error: authError } =
                  await supabase.auth.signUp({
                    email: newProfEmail.trim().toLowerCase(),
                    password: newProfPassword,
                  });

                if (authError) {
                  console.error(
                    "❌ Erreur lors de la création du compte Auth :",
                    authError
                  );
                  alert(
                    "❌ Erreur lors de la création du compte : " +
                      authError.message
                  );
                  return;
                }

                // 2. Ensuite créer le profil professeur avec user_id
                const codeGenere = genererCodeUnique(professeurs);
                const codeConfirmation = Math.floor(
                  100000 + Math.random() * 900000
                ).toString();
                setCodeValidationEnvoye(codeConfirmation);

                const nouveauProf = {
                  user_id: authData.user.id, // 🔥 AJOUT IMPORTANT : lier au compte utilisateur
                  nom: newProfName,
                  prenom: newProfPrenom,
                  email: newProfEmail.trim().toLowerCase(),
                  password: newProfPassword, // Note: vous devriez éviter de stocker le mot de passe en clair
                  code: codeGenere,
                  parametres: {},
                  refuserPartage: false,
                  partagesRecus: [],
                };

                const { data, error } = await supabase
                  .from("professeurs")
                  .insert([nouveauProf])
                  .select();

                if (error) {
                  console.error("❌ Erreur Supabase :", error);
                  alert(
                    "❌ Erreur lors de la création du profil : " + error.message
                  );
                  return;
                }

                console.log("✅ Compte professeur créé sur Supabase :", data);

                // 3. Envoyer l'email de confirmation
                emailjs
                  .send(
                    "service_6dkmtzr",
                    "template_g1aj6kg",
                    {
                      to_email: newProfEmail,
                      confirmation_code: codeConfirmation,
                    },
                    "lyiZ-6klparD8KCNw"
                  )
                  .then(() => {
                    console.log("✅ Email envoyé !");
                  })
                  .catch((error) => {
                    console.error("❌ Erreur envoi email", error);
                  });

                setPage("confirmationEmail");
              } catch (err) {
                console.error("❌ Erreur inattendue :", err);
                alert("❌ Une erreur inattendue est survenue.");
              }
            }}
          >
            ✅ Créer mon compte
          </button>
        </div>
      ) : page === "saisieResultat" ? (
        <div style={{ textAlign: "center", marginTop: "80px" }}>
          <button
            onClick={() => {
              setParcoursActif(null);
              setPage("ecrireResultat");
            }}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          {parcoursActif ? (
            <>
              <h2>✏️ Saisie des résultats</h2>

              {parcoursTerminesEleves.some(
                (p) =>
                  p.eleveCode === eleveConnecte.code &&
                  p.parcoursId === parcoursActif.id
              ) ? (
                <>
                  <p
                    style={{
                      marginTop: "20px",
                      fontSize: "1.1em",
                      fontWeight: "bold",
                    }}
                  >
                    ✅ Parcours "{parcoursActif.nom}" terminé à 100% en{" "}
                    {
                      parcoursTerminesEleves.find(
                        (p) =>
                          p.eleveCode === eleveConnecte.code &&
                          p.parcoursId === parcoursActif.id
                      )?.essais
                    }{" "}
                    {(parcoursTerminesEleves.find(
                      (p) =>
                        p.eleveCode === eleveConnecte.code &&
                        p.parcoursId === parcoursActif.id
                    )?.essais || 1) > 1
                      ? "essais"
                      : "essai"}
                    .
                  </p>
                  <button
                    onClick={() => {
                      setParcoursActif(null);
                      setPage("ecrireResultat");
                    }}
                    style={{
                      fontSize: "1em",
                      padding: "10px 20px",
                      backgroundColor: "#2196F3",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                      marginTop: "20px",
                    }}
                  >
                    ↩️ Retourner aux parcours
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Parcours : <strong>{parcoursActif.nom}</strong> (
                    {parcoursActif.balises.length} balises)
                  </p>
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: "1em",
                      marginBottom: "10px",
                    }}
                  >
                    🧪 Tentatives :{" "}
                    {resultatsEleves.find(
                      (r) =>
                        r.eleveCode === eleveConnecte.code &&
                        r.parcoursId === parcoursActif.id
                    )?.essais || 0}{" "}
                    essai
                    {(resultatsEleves.find(
                      (r) =>
                        r.eleveCode === eleveConnecte.code &&
                        r.parcoursId === parcoursActif.id
                    )?.essais || 0) > 1 && "s"}
                  </p>

                  <div
                    style={{
                      maxWidth: "400px",
                      margin: "30px auto",
                      textAlign: "left",
                    }}
                  >
                    {parcoursActif.balises.map((balise, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: "10px",
                          padding: "10px",
                          border: "1px solid #ddd",
                          borderRadius: "6px",
                          backgroundColor: affichageResultat
                            ? balise.saisi?.toUpperCase().trim() ===
                              balise.code?.toUpperCase().trim()
                              ? "#d4edda" // vert
                              : "#f8d7da" // rouge
                            : "#f9f9f9",
                        }}
                      >
                        <label>Balise {idx + 1}</label>
                        <input
                          type="text"
                          placeholder="Entrer le code trouvé"
                          value={balise.saisi || ""}
                          onChange={(e) => {
                            if (affichageResultat) return;
                            const newBalises = [...parcoursActif.balises];
                            newBalises[idx] = {
                              ...newBalises[idx],
                              saisi: e.target.value.toUpperCase().trim(),
                            };
                            setParcoursActif({
                              ...parcoursActif,
                              balises: newBalises,
                            });
                          }}
                          disabled={affichageResultat}
                          style={{
                            width: "100%",
                            padding: "8px",
                            fontSize: "1em",
                            marginTop: "5px",
                            textTransform: "uppercase",
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {!affichageResultat ? (
                    <button
                      onClick={() => {
                        const correct = parcoursActif.balises.every(
                          (balise) =>
                            balise.saisi?.toUpperCase().trim() ===
                            balise.code?.toUpperCase().trim()
                        );

                        // Calcul du nombre d'essais à incrémenter AVANT
                        let nouveauNombreEssais = 1;
                        const existing = resultatsEleves.find(
                          (r) =>
                            r.eleveCode === eleveConnecte.code &&
                            r.parcoursId === parcoursActif.id
                        );
                        if (existing) {
                          nouveauNombreEssais = existing.essais + 1;
                        }

                        // Mémorisation des tentatives
                        setResultatsEleves((prev) => {
                          if (existing) {
                            return prev.map((r) =>
                              r.eleveCode === eleveConnecte.code &&
                              r.parcoursId === parcoursActif.id
                                ? { ...r, essais: nouveauNombreEssais }
                                : r
                            );
                          } else {
                            return [
                              ...prev,
                              {
                                eleveCode: eleveConnecte.code,
                                parcoursId: parcoursActif.id,
                                essais: nouveauNombreEssais,
                              },
                            ];
                          }
                        });

                        // Ajouter le parcours comme terminé si correct
                        if (correct) {
                          setParcoursTerminesEleves((prev) => {
                            const dejaTermine = prev.find(
                              (p) =>
                                p.eleveCode === eleveConnecte.code &&
                                p.parcoursId === parcoursActif.id
                            );
                            if (dejaTermine) return prev;

                            return [
                              ...prev,
                              {
                                eleveCode: eleveConnecte.code,
                                parcoursId: parcoursActif.id,
                                essais: nouveauNombreEssais,
                              },
                            ];
                          });
                        }

                        setAffichageResultat(true);
                      }}
                      style={{
                        fontSize: "1.1em",
                        padding: "12px 25px",
                        backgroundColor: "#4CAF50",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                        marginTop: "20px",
                      }}
                    >
                      ✅ Valider mon résultat
                    </button>
                  ) : (
                    <>
                      {parcoursActif.balises.every(
                        (balise) =>
                          balise.saisi?.toUpperCase().trim() ===
                          balise.code?.toUpperCase().trim()
                      ) ? (
                        <>
                          <p
                            style={{
                              color: "green",
                              fontWeight: "bold",
                              marginTop: "20px",
                            }}
                          >
                            🎉 Félicitations, tu as trouvé toutes les balises !
                          </p>
                          <button
                            onClick={() => {
                              setParcoursActif(null);
                              setAffichageResultat(false);
                              setPage("ecrireResultat");
                            }}
                            style={{
                              fontSize: "1em",
                              padding: "10px 20px",
                              backgroundColor: "#2196F3",
                              color: "white",
                              border: "none",
                              borderRadius: "5px",
                              cursor: "pointer",
                              marginTop: "15px",
                            }}
                          >
                            ↩️ Retourner aux parcours
                          </button>
                        </>
                      ) : (
                        <>
                          <p
                            style={{
                              color: "red",
                              fontWeight: "bold",
                              marginTop: "20px",
                            }}
                          >
                            Certaines balises sont incorrectes. Réessaie après
                            avoir vérifié.
                          </p>
                          <button
                            onClick={() => {
                              setAffichageResultat(false);
                            }}
                            style={{
                              fontSize: "1em",
                              padding: "10px 20px",
                              backgroundColor: "#2196F3",
                              color: "white",
                              border: "none",
                              borderRadius: "5px",
                              cursor: "pointer",
                              marginTop: "15px",
                            }}
                          >
                            ✏️ Retenter
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <p style={{ marginTop: "100px" }}>Aucun parcours sélectionné.</p>
          )}
        </div>
      ) : page === "confirmationEmail" ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <h2>📧 Confirmation du compte</h2>
          <p>
            Un code vous a été envoyé par email. Veuillez le saisir ci-dessous :
          </p>
          <input
            placeholder="Code de confirmation"
            value={codeEntreParLeProf}
            onChange={(e) => setCodeEntreParLeProf(e.target.value)}
          />
          <br />
          <button
            onClick={() => {
              if (codeEntreParLeProf !== codeValidationEnvoye) {
                alert("❌ Code incorrect.");
                return;
              }

              const nouveauProf = {
                nom: newProfName + " " + newProfPrenom,
                email: newProfEmail,
                code: genererCodeUnique(professeurs),
                password: newProfPassword,
                refuserPartage: false,
              };

              setProfesseurs([...professeurs, nouveauProf]);
              setProfesseur(nouveauProf);
              setModeConnexion("prof"); // ✅ Connecte en mode professeur directement
              setPage("accueil"); // ✅ Dirige vers la page d'accueil ou "gestionParcours" si souhaité
              setCodeEntreParLeProf("");
            }}
          >
            ✅ Valider le code
          </button>
        </div>
      ) : page === "CreerUnNouveauParcours" ? (
        <div
          style={{ marginTop: "100px", textAlign: "center", padding: "20px" }}
        >
          <button
            onClick={() => setPage("gestionParcours")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>📋 Créer un nouveau parcours</h2>

          {/* Gestion du mode de création MANUEL / AUTO */}
          {(!parametresProf?.modeCreationParcours || !modeCreationBalises) && (
            <div style={{ marginTop: "20px" }}>
              <p>Souhaitez-vous ajouter les balises en :</p>
              <button
                onClick={() => setModeCreationBalises("manuel")}
                style={{ margin: "5px", padding: "10px 20px" }}
              >
                ✏️ Mode Manuel
              </button>
              <button
                onClick={() => setModeCreationBalises("automatique")}
                style={{ margin: "5px", padding: "10px 20px" }}
              >
                ⚡ Mode Automatique
              </button>
            </div>
          )}

          {/* Formulaire de création affiché uniquement si le mode est choisi */}
          {modeCreationBalises && (
            <>
              <input
                placeholder="Nom du parcours"
                value={newParcoursNom}
                onChange={(e) => setNewParcoursNom(e.target.value)}
                style={{
                  marginTop: "20px",
                  padding: "10px",
                  width: "80%",
                  maxWidth: "300px",
                }}
              />
              <br />
              <input
                type="number"
                min={1}
                max={1000}
                placeholder="Nombre de balises"
                value={nombreBalises}
                onChange={(e) => setNombreBalises(parseInt(e.target.value))}
                style={{
                  marginTop: "10px",
                  padding: "10px",
                  width: "80%",
                  maxWidth: "300px",
                }}
              />
              {modeCreationBalises && (
                <div style={{ marginTop: "20px" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={attribuerPointsParBalise}
                      onChange={(e) =>
                        setAttribuerPointsParBalise(e.target.checked)
                      }
                    />{" "}
                    Attribuer des points à chaque balise
                  </label>
                </div>
              )}

              {/* Création des balises en fonction du mode */}
              {Array.from({ length: nombreBalises || 0 }, (_, i) => (
                <div key={i} style={{ marginTop: "10px" }}>
                  {modeCreationBalises === "manuel" ? (
                    <>
                      Balise n° {i + 1} :
                      <input
                        placeholder="Code de la balise"
                        value={balisesTemp[i]?.code || ""}
                        onChange={(e) => {
                          const newBalises = [...balisesTemp];
                          newBalises[i] = {
                            ...(newBalises[i] || { index: i + 1 }),
                            code: e.target.value.toUpperCase().trim(),
                          };
                          setBalisesTemp(newBalises);
                        }}
                        style={{
                          marginLeft: "10px",
                          padding: "8px",
                          width: "200px",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      Balise n° {i + 1} :
                      <input
                        type="number"
                        min={1}
                        max={balisesGlobales.length}
                        placeholder="N° de la balise"
                        value={balisesTemp[i]?.index || ""}
                        onChange={(e) => {
                          const indexBalise = parseInt(e.target.value);
                          const codeBalise =
                            balisesGlobales[indexBalise - 1]?.code || "";
                          const newBalises = [...balisesTemp];
                          newBalises[i] = {
                            ...(newBalises[i] || {}),
                            index: indexBalise,
                            code: codeBalise,
                          };
                          setBalisesTemp(newBalises);
                        }}
                        style={{
                          marginLeft: "10px",
                          padding: "8px",
                          width: "80px",
                        }}
                      />
                      {balisesTemp[i]?.index && (
                        <span style={{ marginLeft: "10px" }}>
                          Code :{" "}
                          <strong>
                            {balisesGlobales[balisesTemp[i].index - 1]?.code ||
                              "N/A"}
                          </strong>
                        </span>
                      )}
                    </>
                  )}

                  {/* ✅ Champ points par balise si activé */}
                  {attribuerPointsParBalise && (
                    <label style={{ marginLeft: "10px" }}>
                      Points :
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={
                          balisesTemp[i]?.points !== undefined
                            ? balisesTemp[i]?.points
                            : ""
                        }
                        onChange={(e) => {
                          const newBalises = [...balisesTemp];
                          const value = e.target.value.replace(",", ".");
                          if (value === "") {
                            newBalises[i] = {
                              ...(newBalises[i] || {}),
                              points: "",
                            };
                          } else {
                            const parsed = parseFloat(value);
                            if (!isNaN(parsed)) {
                              newBalises[i] = {
                                ...(newBalises[i] || {}),
                                points: parsed,
                              };
                            }
                          }
                          setBalisesTemp(newBalises);
                        }}
                        style={{
                          marginLeft: "5px",
                          padding: "6px",
                          width: "80px",
                        }}
                      />
                    </label>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  if (
                    attribuerPointsParBalise &&
                    balisesTemp.some(
                      (b) => b.points === undefined || b.points === ""
                    )
                  ) {
                    alert(
                      "❌ Veuillez renseigner les points de chaque balise."
                    );
                    return;
                  }

                  if (!newParcoursNom.trim()) {
                    alert("❌ Le nom du parcours est obligatoire.");
                    return;
                  }
                  if (!nombreBalises || nombreBalises <= 0) {
                    alert("❌ Le nombre de balises doit être positif.");
                    return;
                  }
                  if (
                    balisesTemp.length !== nombreBalises ||
                    balisesTemp.some((b) => !b || !b.code)
                  ) {
                    alert("❌ Veuillez remplir toutes les balises.");
                    return;
                  }

                  const nouveauParcours = {
                    id: Date.now(),
                    nom: newParcoursNom.trim(),
                    balises: balisesTemp,
                    groupesAssocies: [],
                  };

                  setParcoursGlobaux((prev) => [...prev, nouveauParcours]);

                  if (
                    confirm(
                      "✅ Parcours créé avec succès !\n\nSouhaitez-vous créer un nouveau parcours ?"
                    )
                  ) {
                    // Réinitialise tout pour recommencer proprement
                    setModeCreationBalises(null);
                    setNewParcoursNom("");
                    setNombreBalises(0);
                    setBalisesTemp([]);
                  } else {
                    // Retour à la gestion des parcours
                    setPage("gestionParcours");
                    setModeCreationBalises(null);
                  }
                }}
                style={{
                  marginTop: "20px",
                  padding: "12px 25px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                ✅ Valider le parcours
              </button>
            </>
          )}
        </div>
      ) : page === "ecrireResultat" ? (
        <div style={{ marginTop: "80px", textAlign: "center" }}>
          <button
            onClick={() => setPage("eleve")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>✏️ Écrire un résultat</h2>
          <p style={{ color: "#555", fontSize: "0.95em" }}>
            Sélectionne le parcours sur lequel tu souhaites entrer ton résultat.
          </p>

          {/* 📁 Dossiers de parcours accessibles */}
          <div
            style={{
              maxWidth: "600px",
              margin: "30px auto",
              textAlign: "left",
            }}
          >
            {dossiersParcours
              .filter((dossier) =>
                dossier.parcours.some((idParcours) =>
                  parcoursGlobaux.find((p) =>
                    p.groupesAssocies?.some((gid) =>
                      groupes.find(
                        (g) =>
                          g.id === gid &&
                          g.eleves.some((e) => e.code === eleveConnecte.code)
                      )
                    )
                  )
                )
              )
              .map((dossier) => (
                <div
                  key={dossier.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    margin: "10px 0",
                    padding: "10px",
                    background: "#f9f9f9",
                  }}
                >
                  <strong>📁 {dossier.nom}</strong>
                  <div style={{ marginTop: "10px", paddingLeft: "10px" }}>
                    {dossier.parcours
                      .map((idParcours) =>
                        parcoursGlobaux.find((p) => p.id === idParcours)
                      )
                      .filter(
                        (parcours) =>
                          parcours &&
                          parcours.groupesAssocies?.some((gid) =>
                            groupes.find(
                              (g) =>
                                g.id === gid &&
                                g.eleves.some(
                                  (e) => e.code === eleveConnecte.code
                                )
                            )
                          )
                      )
                      .map((parcours) => (
                        <button
                          key={parcours.id}
                          onClick={() => {
                            // ✅ Correction : réinitialiser les saisies avant ouverture
                            const parcoursAvecBalisesVides = {
                              ...parcours,
                              balises: parcours.balises.map((b) => ({
                                ...b,
                                saisi: "",
                              })),
                            };
                            setParcoursActif(parcoursAvecBalisesVides);
                            setAffichageResultat(false);
                            setPage("saisieResultat");
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px",
                            margin: "5px 0",
                            border: "1px solid #ccc",
                            borderRadius: "6px",
                            backgroundColor: termine ? "#d4edda" : "#fff",
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#e0f7fa")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "#fff")
                          }
                        >
                          📋 {parcours.nom} ({parcours.balises.length} balises)
                        </button>
                      ))}
                  </div>
                </div>
              ))}
          </div>

          {/* 📋 Parcours non classés accessibles */}
          <h3 style={{ marginTop: "40px" }}>📋 Parcours disponibles</h3>
          <div
            style={{
              maxWidth: "400px",
              margin: "20px auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {parcoursGlobaux
              .filter(
                (parcours) =>
                  !dossiersParcours.some((d) =>
                    d.parcours.includes(parcours.id)
                  ) &&
                  parcours.groupesAssocies?.some((gid) =>
                    groupes.find(
                      (g) =>
                        g.id === gid &&
                        g.eleves.some((e) => e.code === eleveConnecte.code)
                    )
                  )
              )
              .map((parcours) => {
                const termine = parcoursTerminesEleves.some(
                  (p) =>
                    p.eleveCode === eleveConnecte.code &&
                    p.parcoursId === parcours.id
                );

                return (
                  <button
                    key={parcours.id}
                    onClick={() => {
                      if (termine) return; // 🚫 Blocage si déjà terminé
                      // ✅ Correction : réinitialiser les saisies avant ouverture
                      const parcoursAvecBalisesVides = {
                        ...parcours,
                        balises: parcours.balises.map((b) => ({
                          ...b,
                          saisi: "",
                        })),
                      };
                      setParcoursActif(parcoursAvecBalisesVides);
                      setAffichageResultat(false);
                      setPage("saisieResultat");
                    }}
                    style={{
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      backgroundColor: termine ? "#d4edda" : "#fff", // vert clair si terminé
                      cursor: termine ? "not-allowed" : "pointer", // curseur interdit si terminé
                      opacity: termine ? 0.6 : 1, // grisé si terminé
                      transition: "background 0.2s",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      if (!termine) {
                        e.currentTarget.style.background = "#e0f7fa";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = termine
                        ? "#d4edda"
                        : "#fff";
                    }}
                  >
                    📋 {parcours.nom} ({parcours.balises.length} balises)
                  </button>
                );
              })}
          </div>
        </div>
      ) : page === "eleve" ? (
        <div
          style={{ textAlign: "center", marginTop: "80px", padding: "20px" }}
        >
          {/* Bouton de déconnexion en haut à gauche */}
          <button
            onClick={() => {
              setProfesseur(null);
              setPage("accueil");
              setModeConnexion("accueil");
              setModifierCode(false);
              setMessageErreurCode("");
            }}
            style={{ position: "absolute", top: 10, left: 10 }}
          >
            🚪 Déconnexion
          </button>

          <h2>👋 Bonjour {eleveConnecte.nom} !</h2>

          <p style={{ fontSize: "1em", color: "#555", marginBottom: "30px" }}>
            Que souhaites-tu faire aujourd'hui ?
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              maxWidth: "300px",
              margin: "0 auto",
            }}
          >
            <button
              onClick={() => setPage("ecrireResultat")}
              style={{
                fontSize: "1.1em",
                padding: "12px 20px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              ✏️ Saisir un résultat
            </button>

            <button
              onClick={() => setPage("statistiquesEleve")}
              style={{
                fontSize: "1.1em",
                padding: "12px 20px",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              📊 Voir mes statistiques
            </button>
          </div>
        </div>
      ) : page === "statistiquesEleve" ? (
        <div
          style={{
            marginTop: "60px",
            textAlign: "center",
            fontFamily: "Segoe UI, sans-serif",
            color: "#222",
            padding: "0 10px",
          }}
        >
          <button
            onClick={() => setPage("eleve")}
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "#f0f0f0",
              border: "1px solid #ccc",
              padding: "8px 12px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2 style={{ fontSize: "1.4em", marginBottom: "10px" }}>
            📊 Statistiques de {eleveConnecte.nom}
          </h2>

          {(() => {
            let totalPoints = 0;
            let totalPointsPossibles = 0;

            const parcoursFiltres = parcoursGlobaux.filter((parcours) =>
              parcours.groupesAssocies?.some((gid) =>
                groupes.find(
                  (g) =>
                    g.id === gid &&
                    g.eleves.some((e) => e.code === eleveConnecte.code)
                )
              )
            );

            parcoursFiltres.forEach((parcours) => {
              const parcoursTermine = parcoursTerminesEleves.find(
                (p) =>
                  p.eleveCode === eleveConnecte.code &&
                  p.parcoursId === parcours.id
              );
              const resultats = resultatsEleves.find(
                (r) =>
                  r.eleveCode === eleveConnecte.code &&
                  r.parcoursId === parcours.id
              );
              const essais = resultats?.essais || 0;
              let points = 0;
              let pointsPossibles = 0;

              if (modePoints === "cumul") {
                const ptsParcours = parseFloat(
                  String(baremePointsGlobal.pointsParParcours || 0).replace(
                    ",",
                    "."
                  )
                );
                if (parcoursTermine) points += ptsParcours;
                pointsPossibles += ptsParcours;

                const maxBar = Math.max(
                  ...baremeEvaluation.map(
                    (b) => parseFloat(String(b.points).replace(",", ".")) || 0
                  )
                );
                const bar = baremeEvaluation.find((b) => {
                  if (b.type === "=") return essais === b.tentatives;
                  if (b.type === "≥") return essais >= b.tentatives;
                  if (b.type === "≤") return essais <= b.tentatives;
                  if (b.type === "entre")
                    return (
                      essais >= b.minTentatives && essais <= b.maxTentatives
                    );
                  return false;
                });
                if (bar && essais > 0) {
                  const pts = parseFloat(String(bar.points).replace(",", "."));
                  points += pts;
                }
                pointsPossibles += maxBar;
              } else if (modePoints === "parParcours") {
                const pts = parseFloat(
                  String(baremePointsGlobal.pointsParParcours || 0).replace(
                    ",",
                    "."
                  )
                );
                if (parcoursTermine) points += pts;
                pointsPossibles += pts;
              } else if (modePoints === "parTentatives") {
                const maxBar = Math.max(
                  ...baremeEvaluation.map(
                    (b) => parseFloat(String(b.points).replace(",", ".")) || 0
                  )
                );
                const bar = baremeEvaluation.find((b) => {
                  if (b.type === "=") return essais === b.tentatives;
                  if (b.type === "≥") return essais >= b.tentatives;
                  if (b.type === "≤") return essais <= b.tentatives;
                  if (b.type === "entre")
                    return (
                      essais >= b.minTentatives && essais <= b.maxTentatives
                    );
                  return false;
                });
                if (bar && essais > 0) {
                  const pts = parseFloat(String(bar.points).replace(",", "."));
                  points += pts;
                }
                pointsPossibles += maxBar;
              } else if (modePoints === "personnalise") {
                const pts = parseFloat(
                  String(
                    baremePointsParcours[parcours.id]?.points || 0
                  ).replace(",", ".")
                );
                if (parcoursTermine) points += pts;
                pointsPossibles += pts;
              }

              totalPoints += points;
              totalPointsPossibles += pointsPossibles;
            });

            return (
              <>
                {/* SCORE TOTAL */}
                <div
                  style={{
                    fontSize: "4em",
                    fontWeight: "800",
                    color: "#4CAF50",
                    margin: "20px 0 30px",
                    textShadow: "2px 2px 0 #00000020",
                  }}
                >
                  🏆{" "}
                  {totalPoints.toLocaleString("fr-FR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </div>

                {/* TABLEAU DÉTAILLÉ */}
                <p
                  style={{
                    fontSize: "1em",
                    color: "#555",
                    marginBottom: "10px",
                  }}
                >
                  Points marqués :{" "}
                  {totalPoints.toLocaleString("fr-FR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{" "}
                  /{" "}
                  {totalPointsPossibles.toLocaleString("fr-FR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </p>

                <table
                  style={{
                    margin: "0 auto",
                    borderCollapse: "collapse",
                    width: "100%",
                    maxWidth: "600px",
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    overflow: "hidden",
                    fontSize: "0.95em",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th
                        style={{
                          padding: "10px",
                          borderBottom: "1px solid #ddd",
                        }}
                      >
                        📋 Parcours
                      </th>
                      <th
                        style={{
                          padding: "10px",
                          borderBottom: "1px solid #ddd",
                        }}
                      >
                        🏅 Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcoursFiltres.map((parcours) => {
                      const parcoursTermine = parcoursTerminesEleves.find(
                        (p) =>
                          p.eleveCode === eleveConnecte.code &&
                          p.parcoursId === parcours.id
                      );
                      const resultats = resultatsEleves.find(
                        (r) =>
                          r.eleveCode === eleveConnecte.code &&
                          r.parcoursId === parcours.id
                      );
                      const essais = resultats?.essais || 0;
                      let points = 0;
                      let pointsPossibles = 0;

                      if (modePoints === "cumul") {
                        const ptsParcours = parseFloat(
                          String(
                            baremePointsGlobal.pointsParParcours || 0
                          ).replace(",", ".")
                        );
                        if (parcoursTermine) points += ptsParcours;
                        pointsPossibles += ptsParcours;

                        const maxBar = Math.max(
                          ...baremeEvaluation.map(
                            (b) =>
                              parseFloat(String(b.points).replace(",", ".")) ||
                              0
                          )
                        );
                        const bar = baremeEvaluation.find((b) => {
                          if (b.type === "=") return essais === b.tentatives;
                          if (b.type === "≥") return essais >= b.tentatives;
                          if (b.type === "≤") return essais <= b.tentatives;
                          if (b.type === "entre")
                            return (
                              essais >= b.minTentatives &&
                              essais <= b.maxTentatives
                            );
                          return false;
                        });
                        if (bar && essais > 0) {
                          const pts = parseFloat(
                            String(bar.points).replace(",", ".")
                          );
                          points += pts;
                        }
                        pointsPossibles += maxBar;
                      } else if (modePoints === "parParcours") {
                        const pts = parseFloat(
                          String(
                            baremePointsGlobal.pointsParParcours || 0
                          ).replace(",", ".")
                        );
                        if (parcoursTermine) points += pts;
                        pointsPossibles += pts;
                      } else if (modePoints === "parTentatives") {
                        const maxBar = Math.max(
                          ...baremeEvaluation.map(
                            (b) =>
                              parseFloat(String(b.points).replace(",", ".")) ||
                              0
                          )
                        );
                        const bar = baremeEvaluation.find((b) => {
                          if (b.type === "=") return essais === b.tentatives;
                          if (b.type === "≥") return essais >= b.tentatives;
                          if (b.type === "≤") return essais <= b.tentatives;
                          if (b.type === "entre")
                            return (
                              essais >= b.minTentatives &&
                              essais <= b.maxTentatives
                            );
                          return false;
                        });
                        if (bar && essais > 0) {
                          const pts = parseFloat(
                            String(bar.points).replace(",", ".")
                          );
                          points += pts;
                        }
                        pointsPossibles += maxBar;
                      } else if (modePoints === "personnalise") {
                        const pts = parseFloat(
                          String(
                            baremePointsParcours[parcours.id]?.points || 0
                          ).replace(",", ".")
                        );
                        if (parcoursTermine) points += pts;
                        pointsPossibles += pts;
                      }

                      return (
                        <tr key={parcours.id}>
                          <td
                            style={{
                              padding: "8px",
                              borderBottom: "1px solid #eee",
                              textAlign: "left",
                            }}
                          >
                            {parcours.nom}
                          </td>
                          <td
                            style={{
                              padding: "8px",
                              borderBottom: "1px solid #eee",
                              textAlign: "center",
                            }}
                          >
                            {points.toLocaleString("fr-FR", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}{" "}
                            /{" "}
                            {pointsPossibles.toLocaleString("fr-FR", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      ) : page === "modifierMotDePasse" ? (
        <div
          style={{
            padding: 20,
            maxWidth: 400,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2>🔐 Modification du mot de passe</h2>
          <p style={{ fontSize: "0.9em", color: "#666" }}>
            Le mot de passe doit contenir entre 6 et 20 caractères, une
            majuscule, un chiffre et un symbole.
          </p>

          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={currentPasswordInput}
            onChange={(e) => setCurrentPasswordInput(e.target.value)}
            style={{ width: "300px" }}
          />

          <br />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={newProfPassword}
            onChange={(e) => {
              const value = e.target.value;
              setNewProfPassword(value);
              const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
              setPasswordValide(
                regex.test(value) && value === newProfPasswordConfirm
              );
            }}
            style={{ width: "300px" }}
          />

          <br />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={newProfPasswordConfirm}
            onChange={(e) => {
              const value = e.target.value;
              setNewProfPasswordConfirm(value);
              const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
              setPasswordValide(
                regex.test(newProfPassword) && newProfPassword === value
              );
            }}
            style={{ width: "300px" }}
          />

          <br />
          <button
            disabled={!passwordValide}
            onClick={async () => {
              const password = newProfPassword.trim();
              const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;

              if (!regex.test(password)) {
                alert(
                  "❌ Le mot de passe doit contenir au moins 6 caractères, une majuscule, un chiffre et un symbole."
                );
                return;
              }

              if (newProfPassword !== newProfPasswordConfirm) {
                alert("❌ Les mots de passe ne correspondent pas.");
                return;
              }

              try {
                // ✅ Vérifier la session utilisateur avant updateUser
                const { data: sessionData, error: sessionError } =
                  await supabase.auth.getSession();
                if (sessionError || !sessionData.session) {
                  alert(
                    "❌ Session expirée ou utilisateur non connecté, veuillez vous reconnecter."
                  );
                  setPage("connexion"); // renvoie vers ta page de connexion
                  return;
                }

                // ✅ Modifier le mot de passe dans Supabase Auth
                const { error: authError } = await supabase.auth.updateUser({
                  password,
                });
                if (authError) {
                  console.error(authError);
                  alert(
                    "❌ Erreur lors de la mise à jour du mot de passe : " +
                      authError.message
                  );
                  return;
                }

                alert("✅ Mot de passe modifié avec succès !");
                setNewProfPassword("");
                setNewProfPasswordConfirm("");
                setPasswordValide(false);
                setPage("parametres");
              } catch (error) {
                console.error(error);
                alert("❌ Erreur inattendue : " + error.message);
              }
            }}
          >
            ✅ Valider le changement
          </button>
        </div>
      ) : page === "gestionParcours" ? (
        <div style={{ textAlign: "center", marginTop: "100px" }}>
          <button
            onClick={() => setPage("accueil")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <div style={{ marginTop: 40 }}>
            <button
              onClick={() => setPage("MesParcours")}
              style={{ fontSize: "1.2em", marginBottom: 20 }}
            >
              📁 Mes parcours
            </button>
            <br />
            <button
              onClick={() => setPage("CreerUnNouveauParcours")}
              style={{ fontSize: "1.2em", marginBottom: 20 }}
            >
              ➕ Créer un parcours
            </button>
            <br />
            <button
              onClick={() => setPage("associationParcoursGroupe")}
              style={{ fontSize: "1.2em", marginBottom: 20 }}
            >
              🔗 Associer parcours et groupes
            </button>
            <br />

            <button
              onClick={() => setPage("partageParcours")}
              style={{ fontSize: "1.2em", marginBottom: 20 }}
            >
              📤 Partager les parcours
            </button>
          </div>
        </div>
      ) : page === "MesParcours" ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <button
            onClick={() => setPage("gestionParcours")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>
          <h2>📁 Mes parcours</h2>

          <button
            onClick={() => {
              const nom = prompt("Nom du dossier :");
              if (!nom) return;
              const nouveauDossier = {
                id: Date.now(),
                nom,
                parcours: [],
                sousDossiers: [],
              };
              setDossiersParcours([...dossiersParcours, nouveauDossier]);
            }}
            style={{ marginTop: "20px", fontSize: "1.1em" }}
          >
            ➕ Créer un dossier
          </button>

          <div style={{ marginTop: "20px" }}>
            {dossiersParcours.length === 0 ? (
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Aucun dossier créé pour le moment.
              </p>
            ) : (
              dossiersParcours.map((dossier) => (
                <div
                  key={dossier.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    margin: "10px",
                    padding: "10px",
                    background: "#f9f9f9",
                  }}
                >
                  <strong>{dossier.nom}</strong>
                  <button
                    onClick={() => {
                      const nouveauNom = prompt(
                        "Nouveau nom du dossier :",
                        dossier.nom
                      );
                      if (!nouveauNom) return;
                      setDossiersParcours(
                        dossiersParcours.map((d) =>
                          d.id === dossier.id ? { ...d, nom: nouveauNom } : d
                        )
                      );
                    }}
                    style={{ marginLeft: "10px", fontSize: "0.8em" }}
                  >
                    ✏️ Renommer
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Supprimer ce dossier ?")) return;
                      setDossiersParcours(
                        dossiersParcours.filter((d) => d.id !== dossier.id)
                      );
                    }}
                    style={{
                      marginLeft: "5px",
                      fontSize: "0.8em",
                      color: "red",
                    }}
                  >
                    🗑️ Supprimer
                  </button>

                  {dossier.parcours.length === 0 ? (
                    <p style={{ fontSize: "0.9em", color: "#666" }}>
                      Aucun parcours dans ce dossier.
                    </p>
                  ) : (
                    dossier.parcours.map((idParcours) => {
                      const parcours = parcoursGlobaux.find(
                        (p) => p.id === idParcours
                      );
                      if (!parcours) return null;
                      return (
                        <div key={parcours.id} style={{ marginTop: "5px" }}>
                          {parcours.nom} ({parcours.balises.length} balises)
                          <button
                            onClick={() => {
                              setNewParcoursNom(parcours.nom);
                              setNombreBalises(parcours.balises.length);
                              setBalisesTemp([...parcours.balises]);
                              setEditParcoursId(parcours.id);
                              setPage("CreerUnNouveauParcours");
                            }}
                            style={{ marginLeft: "10px", fontSize: "0.8em" }}
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Supprimer ce parcours ?")) {
                                setParcoursGlobaux(
                                  parcoursGlobaux.filter(
                                    (p) => p.id !== parcours.id
                                  )
                                );
                                // Retirer aussi des dossiers
                                setDossiersParcours(
                                  dossiersParcours.map((d) => ({
                                    ...d,
                                    parcours: d.parcours.filter(
                                      (pid) => pid !== parcours.id
                                    ),
                                  }))
                                );
                              }
                            }}
                            style={{
                              marginLeft: "5px",
                              fontSize: "0.8em",
                              color: "red",
                            }}
                          >
                            🗑️ Supprimer
                          </button>
                          <button
                            onClick={() => {
                              setDossiersParcours(
                                dossiersParcours.map((d) =>
                                  d.id === dossier.id
                                    ? {
                                        ...d,
                                        parcours: d.parcours.filter(
                                          (pid) => pid !== parcours.id
                                        ),
                                      }
                                    : d
                                )
                              );
                            }}
                            style={{
                              marginLeft: "5px",
                              fontSize: "0.8em",
                              color: "orange",
                            }}
                          >
                            ❌ Retirer du dossier
                          </button>
                        </div>
                      );
                    })
                  )}

                  {dossierSelectionPourAjoutParcours === dossier.id && (
                    <div style={{ marginTop: "10px" }}>
                      <p style={{ fontSize: "0.9em", color: "#333" }}>
                        Cliquez sur un parcours à ajouter :
                      </p>
                      {parcoursGlobaux
                        .filter(
                          (p) =>
                            !dossier.parcours.includes(p.id) &&
                            !parcoursEstDansUnAutreDossierParcours(p.id)
                        )
                        .map((parcours) => (
                          <button
                            key={parcours.id}
                            onClick={() => {
                              // Retirer le parcours de tous les dossiers
                              const dossiersMisAJour = dossiersParcours.map(
                                (d) => ({
                                  ...d,
                                  parcours: d.parcours.filter(
                                    (id) => id !== parcours.id
                                  ),
                                })
                              );

                              // Ajouter le parcours uniquement dans le dossier sélectionné
                              const dossiersFinal = dossiersMisAJour.map((d) =>
                                d.id === dossier.id
                                  ? {
                                      ...d,
                                      parcours: [...d.parcours, parcours.id],
                                    }
                                  : d
                              );

                              setDossiersParcours(dossiersFinal);
                              setDossierSelectionPourAjoutParcours(null);
                            }}
                            style={{
                              display: "block",
                              margin: "5px auto",
                              padding: "8px",
                              fontSize: "0.9em",
                              width: "90%",
                            }}
                          >
                            ✅ {parcours.nom} ({parcours.balises.length}{" "}
                            balises)
                          </button>
                        ))}
                      {parcoursGlobaux.filter(
                        (p) =>
                          !dossier.parcours.includes(p.id) &&
                          !parcoursEstDansUnAutreDossierParcours(p.id)
                      ).length === 0 && (
                        <p style={{ fontSize: "0.8em", color: "#888" }}>
                          Tous les parcours sont déjà dans ce dossier.
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setDossierSelectionPourAjoutParcours(dossier.id)
                    }
                    style={{ marginTop: "10px", fontSize: "0.9em" }}
                  >
                    ➕ Ajouter un parcours existant
                  </button>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              marginTop: "30px",
              borderTop: "2px solid #ddd",
              paddingTop: "20px",
            }}
          >
            <h3>📋 Parcours non classés</h3>
            {parcoursGlobaux
              .filter((p) => !parcoursEstDansUnAutreDossierParcours(p.id))
              .map((parcours) => (
                <div
                  key={parcours.id}
                  style={{
                    margin: "10px auto",
                    padding: "10px",
                    width: "300px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background: "#f9f9f9",
                  }}
                >
                  <strong>{parcours.nom}</strong>
                  <br />
                  <small>{parcours.balises.length} balises</small>
                  <br />
                  <button
                    onClick={() => {
                      setNewParcoursNom(parcours.nom);
                      setNombreBalises(parcours.balises.length);
                      setBalisesTemp([...parcours.balises]);
                      setEditParcoursId(parcours.id);
                      setPage("CreerUnNouveauParcours");
                    }}
                  >
                    ✏️ Modifier
                  </button>

                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `❌ Voulez-vous vraiment supprimer le parcours "${parcours.nom}" ?`
                        )
                      ) {
                        // Supprimer le parcours dans parcoursGlobaux
                        const parcoursRestants = parcoursGlobaux.filter(
                          (p) => p.id !== parcours.id
                        );
                        setParcoursGlobaux(parcoursRestants);

                        // Supprimer le parcours dans tous les dossiers qui le contiennent
                        const dossiersMisAJour = dossiersParcours.map(
                          (dossier) => ({
                            ...dossier,
                            parcours: dossier.parcours.filter(
                              (pid) => pid !== parcours.id
                            ),
                          })
                        );
                        setDossiersParcours(dossiersMisAJour);

                        alert(
                          `✅ Parcours "${parcours.nom}" supprimé avec succès.`
                        );
                      }
                    }}
                    style={{ margin: "5px", color: "red" }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              ))}
            {parcoursGlobaux.filter(
              (p) => !parcoursEstDansUnAutreDossierParcours(p.id)
            ).length === 0 && (
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Tous les parcours sont dans des dossiers.
              </p>
            )}
          </div>
        </div>
      ) : page === "partageParcours" ? (
        <div
          style={{
            padding: "20px",
            maxWidth: "600px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <button
            onClick={() => setPage("gestionParcours")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2 style={{ marginBottom: "20px" }}>📦 Partage de parcours</h2>

          <button
            onClick={() => setPage("partageEnvoyer")}
            style={{
              padding: "12px 20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "1.1em",
              marginBottom: "15px",
            }}
          >
            📤 Envoyer des parcours
          </button>
          <br />
          <button
            onClick={() => setPage("partageRecevoir")}
            style={{
              padding: "12px 20px",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "1.1em",
            }}
          >
            📥 Recevoir des parcours
          </button>
        </div>
      ) : page === "associationParcoursGroupe" ? (
        <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
          {professeur && page === "associationParcoursGroupe" && (
            <button
              onClick={() => setPage("gestionParcours")}
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000, // pour s’assurer qu’il passe au-dessus
              }}
            >
              ⬅️ Retour
            </button>
          )}

          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
            🔗 Associer dossiers et parcours aux groupes
          </h2>

          {parcoursGlobaux.length === 0 || groupes.length === 0 ? (
            <p style={{ textAlign: "center", color: "#555" }}>
              Veuillez créer au moins un parcours et un groupe pour commencer
              les associations.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: "8px",
                      background: "#f2f2f2",
                    }}
                  ></th>
                  {groupes.map((groupe) => (
                    <th
                      key={groupe.id}
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#f2f2f2",
                      }}
                    >
                      {groupe.nom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Lignes pour les dossiers */}
                {dossiersParcours.map((dossier) => (
                  <tr key={dossier.id}>
                    <td
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        fontWeight: "bold",
                      }}
                    >
                      📁 {dossier.nom}
                    </td>
                    {groupes.map((groupe) => (
                      <td
                        key={groupe.id}
                        style={{
                          border: "1px solid #ddd",
                          padding: "8px",
                          textAlign: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            const parcoursDuDossier = parcoursGlobaux.filter(
                              (p) => dossier.parcours.includes(p.id)
                            );
                            const parcoursMisAJour = parcoursGlobaux.map(
                              (p) => {
                                if (parcoursDuDossier.includes(p)) {
                                  let nouvellesAssociations =
                                    p.groupesAssocies || [];
                                  if (e.target.checked) {
                                    if (
                                      !nouvellesAssociations.includes(groupe.id)
                                    ) {
                                      nouvellesAssociations = [
                                        ...nouvellesAssociations,
                                        groupe.id,
                                      ];
                                    }
                                  } else {
                                    nouvellesAssociations =
                                      nouvellesAssociations.filter(
                                        (id) => id !== groupe.id
                                      );
                                  }
                                  return {
                                    ...p,
                                    groupesAssocies: nouvellesAssociations,
                                  };
                                }
                                return p;
                              }
                            );
                            setParcoursGlobaux(parcoursMisAJour);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Lignes pour les parcours non classés */}
                {parcoursGlobaux
                  .filter(
                    (p) =>
                      !dossiersParcours.some((d) => d.parcours.includes(p.id))
                  )
                  .map((parcours) => (
                    <tr key={parcours.id}>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>
                        📋 {parcours.nom}
                      </td>
                      {groupes.map((groupe) => (
                        <td
                          key={groupe.id}
                          style={{
                            border: "1px solid #ddd",
                            padding: "8px",
                            textAlign: "center",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={parcours.groupesAssocies?.includes(
                              groupe.id
                            )}
                            onChange={() => {
                              const parcoursMisAJour = parcoursGlobaux.map(
                                (p) => {
                                  if (p.id === parcours.id) {
                                    let nouvellesAssociations =
                                      p.groupesAssocies || [];
                                    if (
                                      nouvellesAssociations.includes(groupe.id)
                                    ) {
                                      nouvellesAssociations =
                                        nouvellesAssociations.filter(
                                          (id) => id !== groupe.id
                                        );
                                    } else {
                                      nouvellesAssociations = [
                                        ...nouvellesAssociations,
                                        groupe.id,
                                      ];
                                    }
                                    return {
                                      ...p,
                                      groupesAssocies: nouvellesAssociations,
                                    };
                                  }
                                  return p;
                                }
                              );
                              setParcoursGlobaux(parcoursMisAJour);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          <div style={{ textAlign: "center", marginTop: "30px" }}>
            <button
              onClick={() => setPage("gestionParcours")}
              style={{
                fontSize: "1em",
                padding: "10px 20px",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              ✅ Sauvegarder et revenir
            </button>
          </div>
        </div>
      ) : page === "gestionGroupes" ? (
        <div style={{ textAlign: "center", marginTop: "100px" }}>
          <button
            onClick={() => setPage("accueil")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          {/* ICI : bouton visible uniquement dans la page gestionGroupes */}

          <div style={{ marginTop: 40 }}>
            <button
              className="bouton-gestion-groupes"
              onClick={() => setPage("mesGroupes")}
            >
              📁 Mes groupes
            </button>

            <br />
            <button
              className="bouton-gestion-groupes"
              onClick={() => setPage("CreerUnGroupe")}
            >
              ➕ Créer un nouveau groupe
            </button>
          </div>
        </div>
      ) : page === "infosGroupe" ? (
        <div style={{ textAlign: "center", marginTop: "80px" }}>
          <button
            onClick={() => setPage("mesGroupes")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>👥 Groupe : {groupeActif.nom}</h2>
          <p style={{ fontSize: "1em", color: "#555" }}>
            {groupeActif.eleves.length}{" "}
            {groupeActif.eleves.length === 1 ? "élève" : "élèves"} dans ce
            groupe
          </p>

          {groupeActif.eleves.length === 0 ? (
            <p style={{ marginTop: "30px", color: "#888" }}>
              Aucun élève dans ce groupe pour le moment.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "10px",
                marginTop: "30px",
                maxWidth: "600px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {groupeActif.eleves.map((eleve, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setEleveActif(eleve);
                    setPage("infosEleve");
                  }}
                  style={{
                    flex: "1 1 40%",
                    padding: "15px",
                    fontSize: "1em",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    backgroundColor: "#f0f0f0",
                    cursor: "pointer",
                    transition: "background 0.2s, transform 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e0f7fa";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f0f0f0";
                  }}
                >
                  👤 {eleve.nom}
                  <br />
                  <small style={{ color: "#777" }}>Code : {eleve.code}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : page === "infosEleve" ? (
        <div
          style={{ textAlign: "center", marginTop: "80px", padding: "20px" }}
        >
          <button
            onClick={() => setPage("infosGroupe")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>👤 Statistiques de {eleveActif.nom}</h2>
          <p>Code : {eleveActif.code}</p>

          <h3 style={{ marginTop: "30px" }}>📊 Parcours terminés</h3>

          {parcoursTerminesEleves.filter((p) => p.eleveCode === eleveActif.code)
            .length === 0 ? (
            <p style={{ color: "#555" }}>
              Aucun parcours terminé par cet élève.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {parcoursTerminesEleves
                .filter((p) => p.eleveCode === eleveActif.code)
                .map((p, idx) => {
                  const parcours = parcoursGlobaux.find(
                    (pg) => pg.id === p.parcoursId
                  );
                  return (
                    <li
                      key={idx}
                      style={{
                        background: "#f9f9f9",
                        padding: "10px",
                        margin: "5px auto",
                        borderRadius: "6px",
                        maxWidth: "400px",
                        border: "1px solid #ddd",
                        textAlign: "left",
                      }}
                    >
                      <strong>
                        📋 {parcours ? parcours.nom : "Parcours supprimé"}
                      </strong>
                      <br />
                      Nombre d'essais : {p.essais}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      ) : page === "mesGroupes" ? (
        <div style={{ textAlign: "center", marginTop: "100px" }}>
          <button
            onClick={() => setPage("gestionGroupes")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>
          <h2>📁 Mes Groupes</h2>

          <button
            onClick={() => {
              const nom = prompt("Nom du dossier :");
              if (!nom) return;
              const nouveauDossier = {
                id: Date.now(),
                nom,
                dossiers: [],
                groupes: [],
              };
              setDossiersGroupes([...dossiersGroupes, nouveauDossier]);
            }}
            style={{ marginTop: "20px", fontSize: "1.1em" }}
          >
            ➕ Créer un dossier
          </button>

          <div style={{ marginTop: "20px" }}>
            {dossiersGroupes.length === 0 ? (
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Aucun dossier créé pour le moment.
              </p>
            ) : (
              dossiersGroupes.map((dossier) => (
                <div
                  key={dossier.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    margin: "10px",
                    padding: "10px",
                    background: "#f9f9f9",
                  }}
                >
                  <strong>{dossier.nom}</strong>
                  <button
                    onClick={() => {
                      const nouveauNom = prompt(
                        "Nouveau nom du dossier :",
                        dossier.nom
                      );
                      if (!nouveauNom) return;
                      setDossiersGroupes(
                        dossiersGroupes.map((d) =>
                          d.id === dossier.id ? { ...d, nom: nouveauNom } : d
                        )
                      );
                    }}
                    style={{ marginLeft: "10px", fontSize: "0.8em" }}
                  >
                    ✏️ Renommer
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Supprimer ce dossier ?")) return;
                      setDossiersGroupes(
                        dossiersGroupes.filter((d) => d.id !== dossier.id)
                      );
                    }}
                    style={{
                      marginLeft: "5px",
                      fontSize: "0.8em",
                      color: "red",
                    }}
                  >
                    🗑️ Supprimer
                  </button>

                  {dossier.groupes.length === 0 ? (
                    <p style={{ fontSize: "0.9em", color: "#666" }}>
                      Aucun groupe dans ce dossier.
                    </p>
                  ) : (
                    dossier.groupes.map((idGroupe) => {
                      const groupe = groupes.find((g) => g.id === idGroupe);
                      if (!groupe) return null;
                      return (
                        <div key={groupe.id} style={{ marginTop: "5px" }}>
                          {groupe.nom} ({groupe.eleves.length} élèves)
                          <button
                            onClick={() => {
                              setDossiersGroupes(
                                dossiersGroupes.map((d) =>
                                  d.id === dossier.id
                                    ? {
                                        ...d,
                                        groupes: d.groupes.filter(
                                          (gid) => gid !== groupe.id
                                        ),
                                      }
                                    : d
                                )
                              );
                            }}
                            style={{
                              marginLeft: "10px",
                              fontSize: "0.8em",
                              color: "red",
                            }}
                          >
                            ❌ Retirer
                          </button>
                        </div>
                      );
                    })
                  )}

                  {dossierSelectionPourAjout === dossier.id && (
                    <div style={{ marginTop: "10px" }}>
                      <p style={{ fontSize: "0.9em", color: "#333" }}></p>
                      {groupes
                        .filter(
                          (g) =>
                            !dossier.groupes.includes(g.id) &&
                            !groupeEstDansUnAutreDossier(g.id)
                        )

                        .map((groupe) => (
                          <button
                            key={groupe.id}
                            onClick={() => {
                              // Retirer le groupe de tous les dossiers
                              const dossiersMisAJour = dossiersGroupes.map(
                                (d) => ({
                                  ...d,
                                  groupes: d.groupes.filter(
                                    (id) => id !== groupe.id
                                  ),
                                })
                              );

                              // Ajouter le groupe uniquement dans le dossier sélectionné
                              const dossiersFinal = dossiersMisAJour.map((d) =>
                                d.id === dossier.id
                                  ? { ...d, groupes: [...d.groupes, groupe.id] }
                                  : d
                              );

                              setDossiersGroupes(dossiersFinal);
                              setDossierSelectionPourAjout(null);
                            }}
                            style={{
                              display: "block",
                              margin: "5px auto",
                              padding: "8px",
                              fontSize: "0.9em",
                              width: "90%",
                            }}
                          >
                            ✅ {groupe.nom} ({groupe.eleves.length} élèves)
                          </button>
                        ))}
                      {groupes.filter(
                        (g) =>
                          !dossier.groupes.includes(g.id) &&
                          !groupeEstDansUnAutreDossier(g.id)
                      ).length === 0 && (
                        <p style={{ fontSize: "0.8em", color: "#888" }}>
                          Tous les groupes sont déjà dans des dossiers.
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setDossierSelectionPourAjout(dossier.id)}
                    style={{ marginTop: "10px", fontSize: "0.9em" }}
                  >
                    ➕ Ajouter un groupe
                  </button>
                </div>
              ))
            )}
          </div>
          <div
            style={{
              marginTop: "30px",
              borderTop: "2px solid #ddd",
              paddingTop: "20px",
            }}
          >
            <h3>📋 Groupes non classés</h3>
            {groupes
              .filter((g) => !groupeEstDansUnAutreDossier(g.id))
              .map((groupe) => (
                <div
                  key={groupe.id}
                  onClick={() => {
                    setGroupeActif(groupe);
                    setPage("infosGroupe");
                  }}
                  style={{
                    margin: "10px auto",
                    padding: "10px",
                    width: "300px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background: "#f9f9f9",
                    cursor: "pointer", // ✅ indique au survol que c'est cliquable
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e0f7fa";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f9f9f9";
                  }}
                >
                  <strong>{groupe.nom}</strong>
                  <br />
                  <small>{groupe.eleves.length} élèves</small>
                  <br />
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // ✅ empêche le clic d'ouvrir la page info
                      setGroupeActif(groupe.id);
                      setNomGroupe(groupe.nom);
                      setGroupeTemporaire(groupe);
                      setPage("CreerUnGroupe");
                    }}
                    style={{
                      marginTop: "5px",
                      fontSize: "0.9em",
                    }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // ✅ empêche le clic d'ouvrir la page info
                      if (confirm("Supprimer ce groupe ?")) {
                        setGroupes(groupes.filter((gr) => gr.id !== groupe.id));
                        setDossiersGroupes(
                          dossiersGroupes.map((d) => ({
                            ...d,
                            groupes: d.groupes.filter(
                              (gid) => gid !== groupe.id
                            ),
                          }))
                        );
                      }
                    }}
                    style={{
                      marginLeft: "5px",
                      fontSize: "0.9em",
                      color: "red",
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              ))}
            {groupes.filter((g) => !groupeEstDansUnAutreDossier(g.id))
              .length === 0 && (
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Tous les groupes sont dans des dossiers.
              </p>
            )}
          </div>
        </div>
      ) : page === "CreerUnGroupe" ? (
        <div style={{ textAlign: "center", marginTop: "80px" }}>
          <button
            onClick={() => {
              setPage("gestionGroupes");
              setNomGroupe("");
              setGroupeActif(null);
              setNomEleve("");
              setGroupeTemporaire(null);
            }}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            ⬅️ Retour
          </button>

          <h2>
            {groupeActif
              ? `Modification du groupe "${
                  groupes.find((g) => g.id === groupeActif)?.nom
                }"`
              : "➕ Créer un groupe"}
          </h2>

          {/* Étape 1 : Nom du groupe */}
          <>
            <h3>📝 Étape 1 : Nom du groupe</h3>
            <input
              placeholder="Entrez le nom du groupe"
              value={nomGroupe}
              onChange={(e) => {
                setNomGroupe(e.target.value);
                if (groupeTemporaire) {
                  setGroupeTemporaire({
                    ...groupeTemporaire,
                    nom: e.target.value,
                  });
                }
              }}
              style={{
                padding: "10px",
                fontSize: "1em",
                width: "300px",
                marginBottom: "20px",
              }}
            />
            {!groupeTemporaire && (
              <>
                <br />
                <button
                  onClick={() => {
                    if (!nomGroupe.trim()) {
                      alert("❌ Le nom du groupe ne peut pas être vide.");
                      return;
                    }
                    // Créer un groupe temporaire avec le nom
                    const nouveau = {
                      id: Date.now(),
                      nom: nomGroupe.trim(),
                      eleves: [],
                    };
                    setGroupeTemporaire(nouveau);
                  }}
                  style={{
                    fontSize: "1.1em",
                    padding: "10px 20px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  ➡️ Étape suivante : Ajouter des élèves
                </button>
              </>
            )}
          </>

          {/* Étape 2 : Ajout des élèves */}
          {groupeTemporaire && (
            <>
              <h3>👥 Étape 2 : Ajouter des élèves</h3>

              {groupeTemporaire.eleves.length === 0 ? (
                <p>Aucun élève pour le moment.</p>
              ) : (
                <>
                  <p>
                    {groupeTemporaire.eleves.length} Élèves dans ce groupe :
                  </p>
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      maxWidth: "400px",
                      margin: "0 auto",
                    }}
                  >
                    {groupeTemporaire.eleves.map((eleve, idx) => (
                      <li
                        key={idx}
                        style={{
                          margin: "5px 0",
                          padding: "8px",
                          backgroundColor: "#f0f0f0",
                          borderRadius: "5px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>
                          {eleve.nom} - Code : {eleve.code}
                        </span>
                        <div>
                          {/* Bouton Renommer */}
                          <button
                            onClick={() => {
                              const nouveauNom = prompt(
                                "Nouveau nom de l'élève :",
                                eleve.nom
                              );
                              if (nouveauNom && nouveauNom.trim() !== "") {
                                const nouveauxEleves = [
                                  ...groupeTemporaire.eleves,
                                ];
                                nouveauxEleves[idx] = {
                                  ...eleve,
                                  nom: nouveauNom.trim(),
                                };
                                setGroupeTemporaire({
                                  ...groupeTemporaire,
                                  eleves: nouveauxEleves,
                                });
                              }
                            }}
                            style={{
                              marginRight: "10px",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                            title="Renommer l'élève"
                          >
                            ✏️
                          </button>

                          {/* Bouton Supprimer */}
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `❌ Supprimer ${eleve.nom} de ce groupe ?`
                                )
                              ) {
                                setGroupeTemporaire({
                                  ...groupeTemporaire,
                                  eleves: groupeTemporaire.eleves.filter(
                                    (_, i) => i !== idx
                                  ),
                                });
                              }
                            }}
                            style={{
                              color: "red",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                            title="Supprimer l'élève"
                          >
                            ❌
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div
                style={{
                  marginTop: "20px",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <input
                  placeholder="Nom de l'élève"
                  value={nomEleve}
                  onChange={(e) => setNomEleve(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      if (!nomEleve.trim()) {
                        alert("❌ Le nom de l'élève ne peut pas être vide.");
                        return;
                      }
                      if (
                        groupeTemporaire.eleves.some(
                          (e) => e.nom === nomEleve.trim()
                        )
                      ) {
                        alert("❌ Cet élève est déjà dans le groupe.");
                        return;
                      }
                      const nouvelEleve = {
                        nom: nomEleve.trim(),
                        code: genererCodeEleveUnique(groupes),
                      };
                      setGroupeTemporaire({
                        ...groupeTemporaire,
                        eleves: [...groupeTemporaire.eleves, nouvelEleve],
                      });
                      setNomEleve("");
                    }
                  }}
                  style={{
                    padding: "10px",
                    fontSize: "1em",
                    width: "250px",
                    marginBottom: "10px",
                  }}
                />

                <button
                  onClick={() => {
                    if (!nomEleve.trim()) {
                      alert("❌ Le nom de l'élève ne peut pas être vide.");
                      return;
                    }
                    if (
                      groupeTemporaire.eleves.some(
                        (e) => e.nom === nomEleve.trim()
                      )
                    ) {
                      alert("❌ Cet élève est déjà dans le groupe.");
                      return;
                    }
                    const nouvelEleve = {
                      nom: nomEleve.trim(),
                      code: genererCodeEleveUnique(groupes),
                    };
                    setGroupeTemporaire({
                      ...groupeTemporaire,
                      eleves: [...groupeTemporaire.eleves, nouvelEleve],
                    });
                    setNomEleve("");
                  }}
                  style={{
                    fontSize: "1em",
                    padding: "10px 15px",
                    backgroundColor: "#2196F3",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  👤 Ajouter élève
                </button>
              </div>

              <div style={{ marginTop: "30px" }}>
                <button
                  onClick={() => {
                    if (groupeTemporaire.eleves.length === 0) {
                      if (
                        !confirm(
                          "⚠️ Voulez-vous vraiment créer un groupe sans élèves ?"
                        )
                      ) {
                        return;
                      }
                    }
                    // Sauvegarder le groupe temporaire définitivement
                    if (groupeActif) {
                      // Mode modification
                      setGroupes(
                        groupes.map((g) =>
                          g.id === groupeActif ? groupeTemporaire : g
                        )
                      );
                      alert("✅ Groupe modifié avec succès !");
                    } else {
                      // Mode création
                      setGroupes([...groupes, groupeTemporaire]);
                      alert("✅ Groupe créé avec succès !");
                    }
                    setGroupeTemporaire(null);
                    setNomGroupe("");
                    setNomEleve("");
                    setGroupeActif(null);
                    setPage("gestionGroupes");
                  }}
                  style={{
                    fontSize: "1.1em",
                    padding: "12px 25px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    marginRight: "10px",
                  }}
                >
                  ✅{" "}
                  {groupeActif
                    ? "Sauvegarder modifications"
                    : "Finaliser la création"}
                </button>

                <button
                  onClick={() => {
                    if (confirm("❌ Annuler la création de ce groupe ?")) {
                      setGroupeTemporaire(null);
                      setNomGroupe("");
                      setNomEleve("");
                    }
                  }}
                  style={{
                    fontSize: "1em",
                    padding: "12px 25px",
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  ❌ Annuler
                </button>
              </div>

              {groupeActif && (
                <button
                  onClick={() => {
                    if (confirm("🗑️ Supprimer définitivement ce groupe ?")) {
                      setGroupes(groupes.filter((g) => g.id !== groupeActif));
                      setGroupeActif(null);
                      setNomGroupe("");
                      setNomEleve("");
                      setGroupeTemporaire(null);
                      alert("✅ Groupe supprimé.");
                      setPage("gestionGroupes");
                    }
                  }}
                  style={{
                    marginTop: "20px",
                    padding: "10px 20px",
                    backgroundColor: "#ff6b6b",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  🗑️ Supprimer le groupe
                </button>
              )}
            </>
          )}
        </div>
      ) : page === "partageEnvoyer" ? (
        <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
          <button
            onClick={() => setPage("partageParcours")}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
              zIndex: 1000,
            }}
          >
            ⬅️ Retour
          </button>

          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
            📤 Partager des parcours
          </h2>

          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <input
              placeholder="Code unique du professeur destinataire"
              value={codeProfesseurDestinataire}
              onChange={(e) =>
                setCodeProfesseurDestinataire(e.target.value.toUpperCase())
              }
              style={{
                padding: "10px",
                fontSize: "1em",
                width: "80%",
                maxWidth: "300px",
                marginBottom: "10px",
              }}
            />
          </div>

          <h3>Dossiers à partager</h3>
          {dossiersParcours.length === 0 ? (
            <p style={{ fontSize: "0.9em", color: "#666" }}>
              Aucun dossier disponible.
            </p>
          ) : (
            dossiersParcours.map((dossier) => (
              <div key={dossier.id} style={{ marginBottom: "5px" }}>
                <label>
                  <input
                    type="checkbox"
                    checked={elementsAEnvoyer.some(
                      (item) =>
                        item.type === "dossier" && item.id === dossier.id
                    )}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setElementsAEnvoyer([
                          ...elementsAEnvoyer,
                          { type: "dossier", id: dossier.id },
                        ]);
                      } else {
                        setElementsAEnvoyer(
                          elementsAEnvoyer.filter(
                            (item) =>
                              !(
                                item.type === "dossier" &&
                                item.id === dossier.id
                              )
                          )
                        );
                      }
                    }}
                  />
                  📁 {dossier.nom}
                </label>
              </div>
            ))
          )}

          <h3>Parcours non classés à partager</h3>
          {parcoursGlobaux.filter(
            (p) => !dossiersParcours.some((d) => d.parcours.includes(p.id))
          ).length === 0 ? (
            <p style={{ fontSize: "0.9em", color: "#666" }}>
              Aucun parcours non classé disponible.
            </p>
          ) : (
            parcoursGlobaux
              .filter(
                (p) => !dossiersParcours.some((d) => d.parcours.includes(p.id))
              )
              .map((parcours) => (
                <div key={parcours.id} style={{ marginBottom: "5px" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={elementsAEnvoyer.some(
                        (item) =>
                          item.type === "parcours" && item.id === parcours.id
                      )}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setElementsAEnvoyer([
                            ...elementsAEnvoyer,
                            { type: "parcours", id: parcours.id },
                          ]);
                        } else {
                          setElementsAEnvoyer(
                            elementsAEnvoyer.filter(
                              (item) =>
                                !(
                                  item.type === "parcours" &&
                                  item.id === parcours.id
                                )
                            )
                          );
                        }
                      }}
                    />
                    📋 {parcours.nom}
                  </label>
                </div>
              ))
          )}

          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button
              onClick={() => {
                // Demander le nom d'expéditeur avant d'envoyer
                const nom = prompt(
                  "Sous quel nom souhaitez-vous envoyer ces documents ?"
                );
                if (!nom || nom.trim() === "") {
                  alert(
                    "❌ Vous devez saisir un nom pour envoyer ces documents."
                  );
                  return;
                }
                setNomExpediteurPartage(nom.trim());

                // Ensuite poursuivre l'envoi normalement
                const profDestinataire = professeurs.find(
                  (p) => p.code === codeProfesseurDestinataire.trim()
                );
                if (!profDestinataire) {
                  alert("❌ Aucun professeur trouvé avec ce code.");
                  return;
                }
                if (
                  profDestinataire &&
                  profDestinataire.refuserPartage === true
                ) {
                  alert(
                    `❌ ${profDestinataire.nom} a activé "Refuser les partages". Il ne peut pas recevoir de partages actuellement.`
                  );
                  return;
                }

                if (elementsAEnvoyer.length === 0) {
                  alert("❌ Vous n'avez sélectionné aucun élément à partager.");
                  return;
                }

                const elementsPartages = elementsAEnvoyer.map((item) => {
                  if (item.type === "dossier") {
                    const dossier = dossiersParcours.find(
                      (d) => d.id === item.id
                    );
                    return {
                      expediteur: nom.trim(), // ➜ ajoute l'expéditeur
                      type: "dossier",
                      id: dossier.id,
                      nom: dossier.nom,
                      parcours: dossier.parcours,
                    };
                  } else if (item.type === "parcours") {
                    const parcours = parcoursGlobaux.find(
                      (p) => p.id === item.id
                    );
                    return {
                      expediteur: nom.trim(), // ➜ ajoute l'expéditeur
                      type: "parcours",
                      id: parcours.id,
                      nom: parcours.nom,
                      balises: parcours.balises,
                      groupesAssocies: parcours.groupesAssocies || [],
                    };
                  }
                });

                const updatedProfesseurs = professeurs.map((p) => {
                  if (p.code === profDestinataire.code) {
                    const partagesRecus = p.partagesRecus || [];
                    return {
                      ...p,
                      partagesRecus: [...partagesRecus, ...elementsPartages],
                    };
                  }
                  return p;
                });
                setProfesseurs(updatedProfesseurs);

                // Synchroniser le professeur connecté si c'est le destinataire
                if (professeur.code === profDestinataire.code) {
                  const profMaj = updatedProfesseurs.find(
                    (p) => p.code === profDestinataire.code
                  );
                  setProfesseur(profMaj);
                }

                setElementsAEnvoyer([]);
                setCodeProfesseurDestinataire("");
                alert("✅ Partage envoyé avec succès !");
              }}
              style={{
                fontSize: "1em",
                padding: "10px 20px",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              📤 Envoyer la sélection
            </button>
          </div>
        </div>
      ) : page === "partageRecevoir" ? (
        <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
          <button
            onClick={() => {
              setPage("partageParcours");
              setOngletPartage(null); // remise à zéro au retour
            }}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "5px",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ⬅️ Retour
          </button>

          <h2 style={{ textAlign: "center", marginTop: "60px" }}>
            📥 Partages reçus
          </h2>

          {professeur?.partagesRecus && professeur.partagesRecus.length > 0 ? (
            <div>
              <h2 style={{ textAlign: "center", marginTop: "60px" }}>
                📥 Partages reçus
              </h2>

              {Object.entries(
                professeur.partagesRecus.reduce(
                  (acc: Record<string, Partage[]>, partage: Partage) => {
                    const expediteur =
                      partage.expediteur || "Expéditeur inconnu";
                    if (!acc[expediteur]) {
                      acc[expediteur] = [];
                    }
                    acc[expediteur].push(partage);
                    return acc;
                  },
                  {}
                )
              ).map(
                ([expediteur, partages]: [string, Partage[]], idx: number) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      padding: "10px",
                      margin: "10px auto",
                      maxWidth: "500px",
                      backgroundColor: "#f9f9f9",
                    }}
                  >
                    <p style={{ fontWeight: "bold", marginBottom: "5px" }}>
                      📩 Souhaitez-vous consulter les partages de : {expediteur}
                    </p>
                    <p style={{ fontSize: "0.9em", color: "#555" }}>
                      Date d'envoi du dernier élément :{" "}
                      {new Date(
                        partages.length > 0
                          ? Math.max(
                              ...partages.map(
                                (p: Partage) => p.date || Date.now()
                              )
                            )
                          : Date.now()
                      ).toLocaleString()}
                    </p>

                    <div style={{ marginTop: "15px" }}>
                      <button
                        onClick={() => {
                          setOngletPartage(
                            ongletPartage === `voir-${idx}`
                              ? null
                              : `voir-${idx}`
                          );
                        }}
                        style={{
                          marginRight: "10px",
                          padding: "6px 12px",
                          backgroundColor: "#2196F3",
                          color: "white",
                          border: "none",
                          borderRadius: "5px",
                          cursor: "pointer",
                        }}
                      >
                        📂{" "}
                        {ongletPartage === `voir-${idx}`
                          ? "Masquer"
                          : "Visionner"}{" "}
                        les partages
                      </button>

                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `❌ Supprimer définitivement tous les partages de ${expediteur} ?`
                            )
                          ) {
                            const updatedProf: Professeur = {
                              ...professeur,
                              partagesRecus: professeur.partagesRecus.filter(
                                (p: Partage) =>
                                  (p.expediteur || "Expéditeur inconnu") !==
                                  expediteur
                              ),
                            };
                            setProfesseur(updatedProf);
                            setProfesseurs((prev: Professeur[]) =>
                              prev.map((p: Professeur) =>
                                p.code === updatedProf.code ? updatedProf : p
                              )
                            );
                            alert(
                              `✅ Tous les partages de ${expediteur} ont été supprimés.`
                            );
                          }
                        }}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#f44336",
                          color: "white",
                          border: "none",
                          borderRadius: "5px",
                          cursor: "pointer",
                        }}
                      >
                        🗑️ Refuser
                      </button>
                    </div>

                    {ongletPartage === `voir-${idx}` && (
                      <div style={{ marginTop: "15px" }}>
                        {partages.map((partage: Partage, index: number) => (
                          <div
                            key={index}
                            style={{
                              borderTop: "1px solid #ccc",
                              paddingTop: "10px",
                              marginTop: "10px",
                            }}
                          >
                            <p>
                              <strong>
                                {partage.type === "dossier"
                                  ? "📁 Dossier"
                                  : "📋 Parcours"}{" "}
                                :
                              </strong>{" "}
                              {partage.nom}
                            </p>

                            <button
                              onClick={() => {
                                let nomFinal = partage.nom.trim();
                                let doublon = true;

                                while (doublon) {
                                  const nouveauNom = prompt(
                                    "Renommer l'élément avant importation :",
                                    nomFinal
                                  );

                                  if (!nouveauNom || nouveauNom.trim() === "") {
                                    alert(
                                      "❌ Vous devez saisir un nom pour importer cet élément."
                                    );
                                    return;
                                  }

                                  nomFinal = nouveauNom.trim();

                                  doublon =
                                    partage.type === "parcours"
                                      ? parcoursGlobaux.some(
                                          (p) =>
                                            p.nom.trim().toLowerCase() ===
                                            nomFinal.toLowerCase()
                                        )
                                      : dossiersParcours.some(
                                          (d) =>
                                            d.nom.trim().toLowerCase() ===
                                            nomFinal.toLowerCase()
                                        );

                                  if (doublon) {
                                    alert(
                                      `❌ Un ${
                                        partage.type === "parcours"
                                          ? "parcours"
                                          : "dossier"
                                      } avec ce nom existe déjà. Veuillez choisir un autre nom.`
                                    );
                                  }
                                }

                                if (partage.type === "dossier") {
                                  setDossiersParcours([
                                    ...dossiersParcours,
                                    { ...partage, nom: nomFinal },
                                  ]);
                                } else if (partage.type === "parcours") {
                                  setParcoursGlobaux([
                                    ...parcoursGlobaux,
                                    { ...partage, nom: nomFinal },
                                  ]);
                                }

                                const updatedProf: Professeur = {
                                  ...professeur,
                                  partagesRecus:
                                    professeur.partagesRecus.filter(
                                      (_, i: number) =>
                                        !(
                                          i ===
                                          professeur.partagesRecus.findIndex(
                                            (p: Partage) => p.id === partage.id
                                          )
                                        )
                                    ),
                                };
                                setProfesseur(updatedProf);
                                setProfesseurs((prev: Professeur[]) =>
                                  prev.map((p: Professeur) =>
                                    p.code === updatedProf.code
                                      ? updatedProf
                                      : p
                                  )
                                );

                                alert(`✅ "${nomFinal}" importé avec succès !`);
                              }}
                              style={{
                                marginRight: "10px",
                                padding: "6px 12px",
                                backgroundColor: "#4CAF50",
                                color: "white",
                                border: "none",
                                borderRadius: "5px",
                                cursor: "pointer",
                              }}
                            >
                              ✅ Importer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            <div>
              <h2 style={{ textAlign: "center", marginTop: "60px" }}>
                📥 Partages reçus
              </h2>
              <p style={{ textAlign: "center" }}>Aucun partage reçu</p>
            </div>
          )}
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
