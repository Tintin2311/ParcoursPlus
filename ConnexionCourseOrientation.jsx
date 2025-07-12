import React, { useState, useEffect } from 'react';
import { MapPin, Users, Play, Trophy, ChevronRight, Eye, EyeOff, Compass, Target, Award, BookOpen, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from "../supabaseClient";

const ConnexionCourseOrientation = ({
  setModeConnexion,
  setPage,
  setProfesseur,
  setNouveauCodeUnique,
  setEleveConnecte,
  professeurs,
  groupes
}) => {
  const [modeLocalConnexion, setModeLocalConnexion] = useState("accueil"); // ← utilisé pour animation locale si besoin
  const [newProfEmail, setNewProfEmail] = useState("");
  const [newProfPassword, setNewProfPassword] = useState("");
  const [codeProfEleve, setCodeProfEleve] = useState("");
  const [codeEleve, setCodeEleve] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleProfLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: newProfEmail.trim().toLowerCase(),
      password: newProfPassword,
    });

    if (error) {
      alert("Email ou mot de passe incorrect.");
      console.error(error);
      return;
    }

    const { data: profData, error: profError } = await supabase
      .from("professeurs")
      .select("*")
      .eq("user_id", data.user.id)
      .single();

    if (profError || !profData) {
      alert("Aucun profil professeur lié à ce compte.");
      console.error(profError);
      return;
    }

    setProfesseur(profData);
    setNouveauCodeUnique(profData.code);
    setModeConnexion("prof");
    setPage("accueil");
  };

  const handleEleveLogin = () => {
    const prof = professeurs.find((p) => p.code === codeProfEleve);
    if (!prof) {
      alert("Professeur introuvable");
      return;
    }

    let eleveTrouve = null;
    for (const groupe of groupes) {
      for (const eleve of groupe.eleves) {
        if (eleve.code === codeEleve) {
          eleveTrouve = eleve;
          break;
        }
      }
      if (eleveTrouve) break;
    }

    if (!eleveTrouve) {
      alert("Aucun élève trouvé avec ce code.");
      return;
    }

    setEleveConnecte(eleveTrouve);
    setModeConnexion("eleve");
    setPage("eleve");
  };

  const handleSecretLogin = () => {
    const FAKE_PROF = {
      nom: "Professeur Secret",
      email: "codesecret",
      code: "SECRET123",
      password: "codesecret",
    };

    setProfesseur(FAKE_PROF);
    setNouveauCodeUnique("SECRET123");
    setModeConnexion("prof");
    setPage("accueil");
  };

  // Page d'accueil avec les deux grandes étiquettes
  if (modeConnexion === "accueil") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/2 left-1/2 w-40 h-40 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse transform -translate-x-1/2 -translate-y-1/2" style={{animationDelay: '4s'}}></div>
        </div>

        {/* Geometric Patterns */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-32 h-32 border-2 border-white rotate-45 rounded-lg"></div>
          <div className="absolute bottom-40 right-20 w-24 h-24 border-2 border-white rotate-12 rounded-full"></div>
          <div className="absolute top-1/3 right-1/4 w-16 h-16 border-2 border-white rotate-45"></div>
        </div>

        <div className={`relative z-10 container mx-auto px-4 py-8 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-600 rounded-2xl mb-6 shadow-2xl transform hover:scale-110 transition-all duration-500 hover:rotate-3 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <Compass className="w-12 h-12 text-white drop-shadow-lg transform group-hover:rotate-180 transition-transform duration-700" />
            </div>
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-emerald-300 mb-4 tracking-tight">
              Parcours+
            </h1>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-light">
              Plateforme numérique pour l'enseignement de la course d'orientation
            </p>
            {/* Subtle Feature Icons */}
            <div className="flex justify-center items-center gap-8 mt-8 opacity-60">
              <div className="group cursor-pointer" title="Gestion des groupes">
                <Users className="w-6 h-6 text-emerald-400 group-hover:scale-125 transition-transform duration-300" />
              </div>
              <div className="group cursor-pointer" title="Sessions interactives">
                <Target className="w-6 h-6 text-cyan-400 group-hover:scale-125 transition-transform duration-300" />
              </div>
              <div className="group cursor-pointer" title="Suivi des progrès">
                <Award className="w-6 h-6 text-purple-400 group-hover:scale-125 transition-transform duration-300" />
              </div>
              <div className="group cursor-pointer" title="Ressources pédagogiques">
                <BookOpen className="w-6 h-6 text-orange-400 group-hover:scale-125 transition-transform duration-300" />
              </div>
            </div>
          </div>

          {/* Grandes étiquettes de navigation */}
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-6 mb-12">
            {/* Étiquette Espace Professeur */}
            <button
              onClick={() => setModeConnexion("espaceProf")}
              className="group relative flex-1 bg-gradient-to-br from-emerald-500/20 to-cyan-600/20 backdrop-blur-xl rounded-3xl p-8 border border-emerald-500/30 hover:border-emerald-400/50 transition-all duration-500 hover:scale-105 shadow-2xl transform hover:-translate-y-2 hover:shadow-emerald-500/25 text-center overflow-hidden"
            >
              {/* Effet de brillance animé */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
              
              <div className="relative z-10">
                <div className="w-20 h-20 bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:rotate-6 transition-transform duration-300">
                  <span className="text-4xl">🧑‍🏫</span>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Espace Professeur</h2>
                <p className="text-emerald-300 text-sm">Créez et gérez vos parcours</p>
              </div>
            </button>

            {/* Étiquette Espace Élève */}
            <button
              onClick={() => setModeConnexion("espaceEleve")}
              className="group relative flex-1 bg-gradient-to-br from-blue-500/20 to-purple-600/20 backdrop-blur-xl rounded-3xl p-8 border border-blue-500/30 hover:border-blue-400/50 transition-all duration-500 hover:scale-105 shadow-2xl transform hover:-translate-y-2 hover:shadow-blue-500/25 text-center overflow-hidden"
            >
              {/* Effet de brillance animé */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
              
              <div className="relative z-10">
                <div className="w-20 h-20 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:rotate-6 transition-transform duration-300">
                  <span className="text-4xl">🎓</span>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Espace Élève</h2>
                <p className="text-blue-300 text-sm">Rejoignez votre parcours</p>
              </div>
            </button>
          </div>

          {/* Quick Access */}
          <div className="max-w-md mx-auto mb-8">
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 backdrop-blur-sm rounded-xl p-4 text-center border border-yellow-500/20 hover:border-yellow-500/40 transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-center mb-3">
                <div className="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mr-2 shadow-lg">
                  <span className="text-white font-bold text-sm">🔐</span>
                </div>
                <h3 className="text-white font-bold text-sm">Accès Rapide</h3>
              </div>
              <button
                onClick={handleSecretLogin}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:from-yellow-600 hover:to-orange-600 transition-all duration-300 hover:scale-105 hover:shadow-xl text-sm"
              >
                Code : SECRET123
              </button>
            </div>
          </div>

          {/* Compact Stats */}
          <div className="max-w-2xl mx-auto mb-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="group">
                  <div className="text-emerald-400 text-lg font-bold">500+</div>
                  <div className="text-slate-400 text-xs">Élèves</div>
                </div>
                <div className="group">
                  <div className="text-cyan-400 text-lg font-bold">50+</div>
                  <div className="text-slate-400 text-xs">Professeurs</div>
                </div>
                <div className="group">
                  <div className="text-purple-400 text-lg font-bold">1000+</div>
                  <div className="text-slate-400 text-xs">Parcours</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-slate-500 text-xs">
            <p>© 2025 Parcours+ - Plateforme éducative pour la course d'orientation</p>
          </div>
        </div>
      </div>
    );
  }

  // Page Espace Professeur
  if (modeConnexion === "espaceProf") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        <div className={`relative z-10 container mx-auto px-4 py-8 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {/* Header avec bouton retour */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setModeConnexion("accueil")}
              className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 group"
            >
              <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
              <span className="text-sm">Retour à l'accueil</span>
            </button>
            
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl mb-3 shadow-2xl">
                <span className="text-2xl">🧑‍🏫</span>
              </div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
                Espace Professeur
              </h1>
            </div>
            
            <div className="w-24"></div> {/* Spacer pour centrer le titre */}
          </div>

          {/* Formulaire de connexion professeur */}
          <div className="max-w-md mx-auto">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
              <div className="space-y-6">
                <div className="relative">
                  <input
                    type="email"
                    placeholder="Adresse email"
                    value={newProfEmail}
                    onChange={(e) => setNewProfEmail(e.target.value)}
                    className="w-full px-4 py-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/10"
                  />
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mot de passe"
                    value={newProfPassword}
                    onChange={(e) => setNewProfPassword(e.target.value)}
                    className="w-full px-4 py-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/10 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors duration-200"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <button
                  onClick={handleProfLogin}
                  className="w-full bg-gradient-to-r from-emerald-500 to-cyan-600 text-white py-4 rounded-xl font-semibold hover:from-emerald-600 hover:to-cyan-700 transition-all duration-300 hover:scale-105 hover:shadow-xl flex items-center justify-center group"
                >
                  Se connecter
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
                <button
                  onClick={() => alert("Redirection vers mot de passe oublié")}
                  className="w-full text-slate-400 hover:text-white transition-colors text-sm underline underline-offset-4"
                >
                  Mot de passe oublié ?
                </button>
                <div className="border-t border-white/20 pt-6">
                  <button
                    onClick={() => setModeConnexion("creationCompteProf")}
                    className="w-full bg-white/10 backdrop-blur-sm text-white py-4 rounded-xl font-semibold hover:bg-white/20 transition-all duration-300 hover:scale-105 border border-white/20 hover:border-white/40"
                  >
                    Créer un compte professeur
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page Espace Élève
  if (modeConnexion === "espaceEleve") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        <div className={`relative z-10 container mx-auto px-4 py-8 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {/* Header avec bouton retour */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setModeConnexion("accueil")}
              className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 group"
            >
              <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
              <span className="text-sm">Retour à l'accueil</span>
            </button>
            
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl mb-3 shadow-2xl">
                <span className="text-2xl">🎓</span>
              </div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                Espace Élève
              </h1>
            </div>
            
            <div className="w-24"></div> {/* Spacer pour centrer le titre */}
          </div>

          {/* Formulaire de connexion élève */}
          <div className="max-w-md mx-auto">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
              <div className="space-y-6">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Code unique professeur"
                    value={codeProfEleve}
                    onChange={(e) => setCodeProfEleve(e.target.value.toUpperCase())}
                    className="w-full px-4 py-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:bg-white/10 uppercase tracking-widest font-mono"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Code élève"
                    value={codeEleve}
                    onChange={(e) => setCodeEleve(e.target.value)}
                    maxLength={6}
                    className="w-full px-4 py-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:bg-white/10"
                  />
                </div>
                <button
                  onClick={handleEleveLogin}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 hover:scale-105 hover:shadow-xl flex items-center justify-center group"
                >
                  Se connecter
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Autres modes de connexion
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 text-center border border-white/20 max-w-md w-full mx-4">
        <h2 className="text-white text-3xl font-bold mb-6">Mode {modeConnexion}</h2>
        <p className="text-slate-400 mb-8">Cette fonctionnalité sera bientôt disponible</p>
        <button
          onClick={() => setModeConnexion("accueil")}
          className="bg-gradient-to-r from-emerald-500 to-cyan-600 text-white px-8 py-4 rounded-2xl font-semibold hover:from-emerald-600 hover:to-cyan-700 transition-all duration-300 hover:scale-105 flex items-center justify-center mx-auto"
        >
          <ChevronRight className="mr-2 w-5 h-5 rotate-180" />
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
};

export default ConnexionCourseOrientation;