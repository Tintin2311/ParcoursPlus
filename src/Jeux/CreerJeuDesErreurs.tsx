// src/Jeux/CreerJeuDesErreurs.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type ZoneType = "missing" | "wrong";

type Props = {
  setPage?: (page: any) => void;
};

type SymbolType =
  | "black_circle"
  | "black_cross"
  | "green_circle"
  | "v_shape"
  | "fence"
  | "black_triangle"
  | "black_rectangle";

type SymbolItem = {
  id: SymbolType;
};

type Zone = {
  id: string;
  type: ZoneType;
  cx: number;
  cy: number;
  r: number;
  symbol?: SymbolType | null;
};

const SYMBOLS: SymbolItem[] = [
  { id: "black_circle" },
  { id: "black_cross" },
  { id: "green_circle" },
  { id: "v_shape" },
  { id: "fence" },
  { id: "black_triangle" },
  { id: "black_rectangle" },
];

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function makeCirclePath(cx: number, cy: number, r: number) {
  return `
    M ${cx - r} ${cy}
    A ${r} ${r} 0 1 0 ${cx + r} ${cy}
    A ${r} ${r} 0 1 0 ${cx - r} ${cy}
  `;
}

function SymbolPreview({
  id,
  size = 34,
  selected = false,
}: {
  id: SymbolType;
  size?: number;
  selected?: boolean;
}) {
  const stroke = selected ? "#0E7A38" : "#111111";

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {id === "black_circle" && <Circle cx={20} cy={20} r={7} fill="#111111" />}

      {id === "black_cross" && (
        <G>
          <Line x1={13} y1={13} x2={27} y2={27} stroke="#111111" strokeWidth={4} strokeLinecap="round" />
          <Line x1={27} y1={13} x2={13} y2={27} stroke="#111111" strokeWidth={4} strokeLinecap="round" />
        </G>
      )}

      {id === "green_circle" && (
        <Circle cx={20} cy={20} r={9} stroke="#18B957" strokeWidth={4} fill="transparent" />
      )}

      {id === "v_shape" && (
        <Path d="M 11 12 L 20 28 L 29 12" stroke="#111111" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {id === "fence" && (
        <G>
          <Line x1={7} y1={22} x2={33} y2={22} stroke="#111111" strokeWidth={3.5} strokeLinecap="round" />
          <Line x1={12} y1={28} x2={17} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
          <Line x1={20} y1={28} x2={25} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
          <Line x1={28} y1={28} x2={33} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
        </G>
      )}

      {id === "black_triangle" && (
        <Path d="M 20 8 L 32 30 L 8 30 Z" fill="#111111" />
      )}

      {id === "black_rectangle" && (
        <Rect x={10} y={12} width={20} height={16} rx={1} stroke="#111111" strokeWidth={4} fill="transparent" />
      )}
    </Svg>
  );
}

function ZoneSymbol({
  id,
  x,
  y,
}: {
  id: SymbolType;
  x: number;
  y: number;
}) {
  return (
    <G transform={`translate(${x - 20}, ${y - 20})`}>
      {id === "black_circle" && <Circle cx={20} cy={20} r={7} fill="#111111" />}

      {id === "black_cross" && (
        <G>
          <Line x1={13} y1={13} x2={27} y2={27} stroke="#111111" strokeWidth={4} strokeLinecap="round" />
          <Line x1={27} y1={13} x2={13} y2={27} stroke="#111111" strokeWidth={4} strokeLinecap="round" />
        </G>
      )}

      {id === "green_circle" && (
        <Circle cx={20} cy={20} r={9} stroke="#18B957" strokeWidth={4} fill="transparent" />
      )}

      {id === "v_shape" && (
        <Path d="M 11 12 L 20 28 L 29 12" stroke="#111111" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {id === "fence" && (
        <G>
          <Line x1={7} y1={22} x2={33} y2={22} stroke="#111111" strokeWidth={3.5} strokeLinecap="round" />
          <Line x1={12} y1={28} x2={17} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
          <Line x1={20} y1={28} x2={25} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
          <Line x1={28} y1={28} x2={33} y2={16} stroke="#111111" strokeWidth={2.8} strokeLinecap="round" />
        </G>
      )}

      {id === "black_triangle" && (
        <Path d="M 20 8 L 32 30 L 8 30 Z" fill="#111111" />
      )}

      {id === "black_rectangle" && (
        <Rect x={10} y={12} width={20} height={16} rx={1} stroke="#111111" strokeWidth={4} fill="transparent" />
      )}
    </G>
  );
}

export default function CreerJeuDesErreurs({ setPage }: Props) {
  const { width, height } = useWindowDimensions();

  const isMobile = width < 720;
  const maxWidth = Math.min(width - 24, 1000);
  const mapWidth = maxWidth;
  const mapHeight = Math.min(height * 0.52, isMobile ? 360 : 520);

  const fileInputRef = useRef<any>(null);

  const [title, setTitle] = useState("Jeu des 7 erreurs");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [imageScale, setImageScale] = useState(1);
  const [zoneType, setZoneType] = useState<ZoneType>("missing");
  const [selectedSymbol, setSelectedSymbol] =
    useState<SymbolType>("black_circle");
  const [zones, setZones] = useState<Zone[]>([]);

  const [circleStart, setCircleStart] = useState<{ x: number; y: number } | null>(null);
  const [previewCircle, setPreviewCircle] = useState<{ cx: number; cy: number; r: number } | null>(null);

  const zonesCount = zones.length;

  const addZone = (cx: number, cy: number, r: number) => {
    if (r < 8) return;

    setZones((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        type: zoneType,
        cx,
        cy,
        r,
        symbol: zoneType === "missing" ? selectedSymbol : null,
      },
    ]);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!imageUri,
        onMoveShouldSetPanResponder: () => !!imageUri,

        onPanResponderGrant: (evt) => {
          if (!imageUri) return;

          const { locationX, locationY } = evt.nativeEvent;
          setCircleStart({ x: locationX, y: locationY });
          setPreviewCircle({ cx: locationX, cy: locationY, r: 1 });
        },

        onPanResponderMove: (evt) => {
          if (!imageUri || !circleStart) return;

          const { locationX, locationY } = evt.nativeEvent;
          const dx = locationX - circleStart.x;
          const dy = locationY - circleStart.y;
          const r = Math.sqrt(dx * dx + dy * dy);

          setPreviewCircle({ cx: circleStart.x, cy: circleStart.y, r });
        },

        onPanResponderRelease: () => {
          if (previewCircle) {
            addZone(previewCircle.cx, previewCircle.cy, previewCircle.r);
          }

          setCircleStart(null);
          setPreviewCircle(null);
        },
      }),
    [imageUri, circleStart, previewCircle, zoneType, selectedSymbol]
  );

  const loadFile = (file: any) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setImageUri(result);
      setZones([]);
      setImageScale(1);
    };
    reader.readAsDataURL(file);
  };

  const pickImageWeb = () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click?.();
      return;
    }

    Alert.alert(
      "Image",
      "Sur mobile, on ajoutera ensuite expo-image-picker. Pour l'instant, utilise la version web pour importer une image."
    );
  };

  const onFileSelectedWeb = (event: any) => {
    const file = event?.target?.files?.[0];
    loadFile(file);
  };

  const handleDropWeb = (event: any) => {
    if (Platform.OS !== "web") return;

    event.preventDefault?.();
    event.stopPropagation?.();

    const file = event?.dataTransfer?.files?.[0];
    loadFile(file);
  };

  const handleDragOverWeb = (event: any) => {
    if (Platform.OS !== "web") return;

    event.preventDefault?.();
    event.stopPropagation?.();
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const undo = () => setZones((prev) => prev.slice(0, -1));

  const reset = () => {
    Alert.alert("Effacer", "Effacer toutes les zones ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Effacer", style: "destructive", onPress: () => setZones([]) },
    ]);
  };

  const removeImage = () => {
    Alert.alert("Image", "Retirer l'image ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () => {
          setImageUri(null);
          setZones([]);
          setImageScale(1);
        },
      },
    ]);
  };

  const zoomOut = () => setImageScale((s) => clamp(Number((s - 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE));
  const zoomIn = () => setImageScale((s) => clamp(Number((s + 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE));
  const resetZoom = () => setImageScale(1);
  const fitZoom = () => setImageScale(0.85);

  const saveLocal = () => {
    if (!imageUri) {
      Alert.alert("Image manquante", "Ajoute d'abord une image de carte.");
      return;
    }

    if (zones.length === 0) {
      Alert.alert("Zones manquantes", "Définis au moins une zone sur la carte.");
      return;
    }

    Alert.alert(
      "Création prête",
      `Titre : ${title}\nZones créées : ${zonesCount}\nTaille image : ${Math.round(imageScale * 100)}%\n\nOn branchera ensuite l'enregistrement Supabase.`
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={["#0E4D78", "#1F7AAD"]} style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setPage?.("gestionParcours")}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.titleBox}>
          <Text style={styles.title}>CRÉER UN JEU</Text>
          <Text style={styles.subtitle}>Jeu des 7 erreurs</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.formCard, { width: maxWidth }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Nom du jeu"
            style={styles.input}
            placeholderTextColor="#8AA1B2"
          />
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              zoneType === "missing" && styles.greenActive,
            ]}
            onPress={() => setZoneType("missing")}
          >
            <Feather name="plus-circle" size={18} color="#fff" />
            <Text style={styles.modeText}>Élément manquant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, zoneType === "wrong" && styles.redActive]}
            onPress={() => setZoneType("wrong")}
          >
            <Feather name="x-circle" size={18} color="#fff" />
            <Text style={styles.modeText}>Élément faux</Text>
          </TouchableOpacity>
        </View>

        {zoneType === "missing" && (
          <View style={[styles.symbolPanel, { width: maxWidth }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.symbolScroll}
            >
              {SYMBOLS.map((symbol) => {
                const active = selectedSymbol === symbol.id;

                return (
                  <TouchableOpacity
                    key={symbol.id}
                    activeOpacity={0.9}
                    onPress={() => setSelectedSymbol(symbol.id)}
                    style={[
                      styles.symbolBtn,
                      active && styles.symbolBtnActive,
                    ]}
                  >
                    <SymbolPreview id={symbol.id} selected={active} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={[styles.hintBox, { width: maxWidth }]}>
          <Text style={styles.hintText}>
            {zoneType === "missing"
              ? "Dessine la zone où l'élève devra placer le symbole."
              : "Dessine la zone où l'élève devra cliquer."}
          </Text>
        </View>

        <View
          style={[styles.mapCard, { width: mapWidth, height: mapHeight }]}
          {...(Platform.OS === "web"
            ? {
                onDrop: handleDropWeb,
                onDragOver: handleDragOverWeb,
              }
            : {})}
        >
          {Platform.OS === "web" && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onFileSelectedWeb}
            />
          )}

          {!imageUri ? (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.emptyImageBox}
              onPress={pickImageWeb}
            >
              <View style={styles.bigPlusCircle}>
                <Feather name="plus" size={44} color="#1F5B86" />
              </View>

              <Text style={styles.emptyTitle}>Insérer une image</Text>
              <Text style={styles.emptySubtitle}>
                Clique ici, ou glisse une image dans ce cadre
              </Text>

              <TouchableOpacity style={styles.importBtn} onPress={pickImageWeb}>
                <Feather name="upload" size={18} color="#fff" />
                <Text style={styles.importBtnText}>Importer</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ) : (
            <View
              style={styles.mapWrapper}
              {...(Platform.OS === "web"
                ? {
                    onDrop: handleDropWeb,
                    onDragOver: handleDragOverWeb,
                  }
                : {})}
            >
              <Image
                source={{ uri: imageUri }}
                style={[
                  styles.mapImage,
                  {
                    transform: [{ scale: imageScale }],
                  },
                ]}
                resizeMode="contain"
              />

              <View style={styles.touchLayer} {...panResponder.panHandlers}>
                <Svg width="100%" height="100%">
                  {zones.map((zone) => {
                    const isMissing = zone.type === "missing";
                    const circlePath = makeCirclePath(zone.cx, zone.cy, zone.r);

                    return (
                      <React.Fragment key={zone.id}>
                        <Path
                          d={circlePath}
                          stroke={isMissing ? "#18B957" : "#E53935"}
                          strokeWidth={5}
                          fill={
                            isMissing
                              ? "rgba(24,185,87,0.10)"
                              : "rgba(229,57,53,0.10)"
                          }
                        />

                        {isMissing && zone.symbol ? (
                          <ZoneSymbol id={zone.symbol} x={zone.cx} y={zone.cy} />
                        ) : (
                          <Circle cx={zone.cx} cy={zone.cy} r={7} fill="#E53935" />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {previewCircle && (
                    <Circle
                      cx={previewCircle.cx}
                      cy={previewCircle.cy}
                      r={previewCircle.r}
                      stroke={zoneType === "missing" ? "#18B957" : "#E53935"}
                      strokeWidth={5}
                      fill={
                        zoneType === "missing"
                          ? "rgba(24,185,87,0.10)"
                          : "rgba(229,57,53,0.10)"
                      }
                    />
                  )}
                </Svg>
              </View>

              <View style={styles.imageTools}>
                <TouchableOpacity style={styles.imageToolBtn} onPress={zoomOut}>
                  <Feather name="minus" size={16} color="#fff" />
                </TouchableOpacity>

                <Text style={styles.imageToolText}>
                  {Math.round(imageScale * 100)}%
                </Text>

                <TouchableOpacity style={styles.imageToolBtn} onPress={zoomIn}>
                  <Feather name="plus" size={16} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.imageToolTextBtn} onPress={resetZoom}>
                  <Text style={styles.imageToolTextBtnLabel}>100%</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.imageToolTextBtn} onPress={fitZoom}>
                  <Text style={styles.imageToolTextBtnLabel}>Adapter</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.removeImageBtn} onPress={removeImage}>
                <Feather name="image" size={16} color="#fff" />
                <Text style={styles.removeImageText}>Changer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.statsBox}>
          <Text style={styles.statsText}>Zones définies : {zonesCount} / 7</Text>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity style={styles.whiteBtn} onPress={undo}>
            <Feather name="corner-up-left" size={18} color="#1F5B86" />
            <Text style={styles.whiteBtnText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.whiteBtn} onPress={reset}>
            <Feather name="trash-2" size={18} color="#1F5B86" />
            <Text style={styles.whiteBtnText}>Effacer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={saveLocal}>
            <Feather name="save" size={20} color="#fff" />
            <Text style={styles.saveText}>Enregistrer</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 42 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DFF3FF" },

  topBar: {
    height: Platform.OS === "web" ? 86 : 82,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },

  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  titleBox: { flex: 1, alignItems: "center", marginRight: 44 },

  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },

  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },

  scroll: { flex: 1 },

  scrollContent: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 26,
  },

  formCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    marginBottom: 10,
  },

  input: {
    backgroundColor: "#EEF8FF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#123A52",
    fontWeight: "800",
  },

  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginBottom: 10,
  },

  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7B94A8",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
  },

  greenActive: { backgroundColor: "#18B957" },
  redActive: { backgroundColor: "#E53935" },

  modeText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  symbolPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  symbolScroll: {
    gap: 10,
    paddingRight: 8,
  },

  symbolBtn: {
    width: 62,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#EEF8FF",
    borderWidth: 2,
    borderColor: "#D6E7F2",
    alignItems: "center",
    justifyContent: "center",
  },

  symbolBtnActive: {
    borderColor: "#18B957",
    backgroundColor: "#E9FFF0",
  },

  hintBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },

  hintText: {
    color: "#1F5B86",
    fontWeight: "900",
    textAlign: "center",
  },

  mapCard: {
    backgroundColor: "#fff",
    borderRadius: 28,
    borderWidth: 5,
    borderColor: "#fff",
    overflow: "hidden",
  },

  emptyImageBox: {
    flex: 1,
    backgroundColor: "#EEF8FF",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  bigPlusCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#CFE0EC",
  },

  emptyTitle: {
    color: "#1F5B86",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  emptySubtitle: {
    color: "#6B7E8E",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },

  importBtn: {
    marginTop: 14,
    backgroundColor: "#1F5B86",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  importBtnText: {
    color: "#fff",
    fontWeight: "900",
  },

  mapWrapper: {
    flex: 1,
    position: "relative",
    backgroundColor: "#EEF8FF",
  },

  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },

  touchLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  imageTools: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "rgba(31,91,134,0.90)",
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  imageToolBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },

  imageToolText: {
    color: "#fff",
    fontWeight: "900",
    minWidth: 42,
    textAlign: "center",
  },

  imageToolTextBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  imageToolTextBtnLabel: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },

  removeImageBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "rgba(31,91,134,0.90)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  removeImageText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },

  statsBox: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  statsText: {
    color: "#1F5B86",
    fontWeight: "900",
  },

  bottomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 10,
  },

  whiteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#fff",
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 18,
  },

  whiteBtnText: { color: "#1F5B86", fontWeight: "900" },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#1F5B86",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 18,
  },

  saveText: { color: "#fff", fontWeight: "900" },
});