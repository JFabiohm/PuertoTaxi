(function() {
  "use strict";
  try {
    var _origWarn = console.warn;
    console.warn = function() {
      var msg = arguments && arguments[0] ? String(arguments[0]) : "";
      if (msg.indexOf("cdn.tailwindcss.com") !== -1 || msg.indexOf("in-browser Babel transformer") !== -1 || msg.indexOf("location.reload") !== -1 || msg.indexOf("AudioContext") !== -1) {
        return;
      }
      if (_origWarn) _origWarn.apply(console, arguments);
    };
  } catch (e) {
  }
  var APP_VERSION = "1.1.0";
  try {
    var storedVersion = localStorage.getItem("app_version");
    var reloadedFlag = sessionStorage.getItem("app_reloaded_v" + APP_VERSION);
    if (storedVersion && storedVersion !== APP_VERSION && !reloadedFlag) {
      localStorage.setItem("app_version", APP_VERSION);
      sessionStorage.setItem("app_reloaded_v" + APP_VERSION, "true");
      window.location.reload();
    } else if (!storedVersion) {
      localStorage.setItem("app_version", APP_VERSION);
    }
  } catch (e) {
  }
})();
(async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const {
      getFirestore,
      collection,
      doc,
      addDoc,
      updateDoc,
      onSnapshot,
      query,
      where,
      getDocs,
      deleteDoc,
      getDoc,
      setDoc
    } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const firebaseConfig = {
      apiKey: "AIzaSyDXGnh9P68_I2Z1VXVXWGSwTQJoYZ1VyfA",
      authDomain: "taxi-click-puntarenas.firebaseapp.com",
      projectId: "taxi-click-puntarenas",
      storageBucket: "taxi-click-puntarenas.firebasestorage.app",
      messagingSenderId: "755042849542",
      appId: "1:755042849542:web:543baf380560d81758c487",
      measurementId: "G-DW5LR16GL8"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    window.app = app;
    window.db = db;
    window.firebaseDb = db;
    window.firebaseOps = {
      collection,
      doc,
      addDoc,
      updateDoc,
      onSnapshot,
      query,
      where,
      getDocs,
      deleteDoc,
      getDoc,
      setDoc
    };
    window.firebaseStatus = "connected";
    window.dispatchEvent(new CustomEvent("firebase-initialized", { detail: { db, app, status: "connected" } }));
  } catch (e) {
    console.warn("Firebase Init Error:", e);
  }
})();
const { useState, useEffect, useRef, useMemo } = React;
const PUNTARENAS_ZONES = [
  "Barrio El Carmen",
  "Puntarenas Centro",
  "El Cocal",
  "La Gran Chacarita",
  "El Boli",
  "Ant. Hospital y alrededores",
  "Caldera",
  "El Roble-Jireth",
  "Alrededores de Plamas-JuanitoMora",
  "Do\xF1a Cecilia-Almedros-Santa Rosa",
  "Feria-BarrrancaCentro-Cruce",
  "Costanera-Reseda-Chaguite"
];
const INITIAL_DRIVERS = [];
function App() {
  const [driverAuthenticated, setDriverAuthenticated] = useState(() => {
    try {
      return localStorage.getItem("puertotaxi_driver_auth") === "true";
    } catch (e) {
      return false;
    }
  });
  const [loggedDriver, setLoggedDriver] = useState(() => {
    try {
      const saved = localStorage.getItem("puertotaxi_logged_driver");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          const plate = parsed.licensePlate || parsed.placa || "";
          return {
            ...parsed,
            licensePlate: plate
          };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [role, setRole] = useState(() => {
    try {
      const activeTabRole = sessionStorage.getItem("puertotaxi_active_role");
      if (activeTabRole === "PASSENGER" || activeTabRole === "DRIVER" || activeTabRole === "ADMIN_CENTRAL") {
        return activeTabRole;
      }
      const sesionPasajero = localStorage.getItem("sesion_pasajero") || localStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("puertotaxi_phone");
      if (sesionPasajero && String(sesionPasajero).replace(/\D/g, "").length >= 8) {
        return "PASSENGER";
      }
      const auth = localStorage.getItem("puertotaxi_driver_auth") === "true";
      const saved = localStorage.getItem("puertotaxi_logged_driver");
      const d = saved ? JSON.parse(saved) : null;
      if (auth && d && (String(d.role || "").toLowerCase() === "admin" || String(d.email || "").toLowerCase() === "taxiclickpuntarenas@gmail.com")) {
        return "ADMIN_CENTRAL";
      }
      if (auth && d) {
        return "DRIVER";
      }
    } catch (e) {
    }
    return null;
  });
  const isAdmin = role === "ADMIN_CENTRAL" || driverAuthenticated && loggedDriver && (String(loggedDriver.role || "").toLowerCase() === "admin" || String(loggedDriver.email || "").toLowerCase() === "taxiclickpuntarenas@gmail.com");
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
    try {
      if (role) {
        sessionStorage.setItem("puertotaxi_active_role", role);
      } else {
        sessionStorage.removeItem("puertotaxi_active_role");
      }
    } catch (e) {
    }
  }, [role]);
  useEffect(() => {
    if (driverAuthenticated && loggedDriver && !isAdmin && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(5);
          const lng = pos.coords.longitude.toFixed(5);
          setLoggedDriver((prev) => prev ? { ...prev, lastLat: lat, lastLng: lng } : prev);
        },
        () => {
        },
        {
          enableHighAccuracy: true,
          timeout: 1e4,
          maximumAge: 0
        }
      );
    }
  }, [driverAuthenticated, isAdmin]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleIncoming = (type, data) => {
      const req = data && (data.payload || data.request) || data;
      if (type === "NEW_REQUEST" && req) {
        if (roleRef.current === "DRIVER" || roleRef.current === "ADMIN_CENTRAL") {
          const created = req.creadoEn || req.createdAt || Date.now();
          if (Date.now() - created < 15e3) {
            setPendingRequest((prev) => {
              const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
              const filtered = list.filter((item) => item && Date.now() - (item.creadoEn || item.createdAt || 0) < 15e3);
              const exists = filtered.some((item) => item.firestoreId && req.firestoreId && item.firestoreId === req.firestoreId || item.id && req.id && item.id === req.id);
              const next = exists ? filtered.map((item) => item.firestoreId && req.firestoreId && item.firestoreId === req.firestoreId || item.id && req.id && item.id === req.id ? { ...item, ...req } : item) : [...filtered, req];
              next.sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0));
              return next;
            });
            setDriverRequestCountdown(Math.max(0, Math.ceil((15e3 - (Date.now() - created)) / 1e3)));
            playBeep(880, 0.35);
          }
        }
      } else if (type === "CANCEL_REQUEST") {
        setPendingRequest((prev) => {
          if (!prev) return null;
          if (Array.isArray(prev)) {
            if (data && data.requestId) {
              const next = prev.filter((item) => item && item.id !== data.requestId && item.firestoreId !== data.requestId);
              return next.length > 0 ? next : null;
            }
            return null;
          }
          if (data && data.requestId && prev.id && prev.id !== data.requestId) {
            return prev;
          }
          return null;
        });
        setDriverRequestCountdown(15);
      } else if (type === "ACCEPT_REQUEST") {
        setPendingRequest(null);
        const trip = data && (data.trip || data.payload) || null;
        if (trip) {
          setActiveTrip(trip);
          try {
            localStorage.setItem("puertotaxi_active_trip", JSON.stringify(trip));
            sessionStorage.setItem("puertotaxi_active_trip", JSON.stringify(trip));
          } catch (e) {
          }
          playBeep(1100, 0.3);
        }
      } else if (type === "CANCEL_TRIP" || type === "FINISH_TRIP") {
        setActiveTrip(null);
        setChatMessages([]);
        try {
          localStorage.removeItem("puertotaxi_active_trip");
          localStorage.removeItem("taxiclick_active_trip");
          sessionStorage.removeItem("puertotaxi_active_trip");
        } catch (e) {
        }
      } else if (type === "CHAT_MESSAGE") {
        const incomingMsg = data && data.message;
        if (incomingMsg) {
          setChatMessages((prev) => {
            const exists = prev.some((m) => m.id && incomingMsg.id && m.id === incomingMsg.id || m.timestamp === incomingMsg.timestamp && m.sender === incomingMsg.sender);
            if (exists) return prev;
            const next = [...prev, incomingMsg].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            try {
              if (data.tripId) {
                localStorage.setItem("puertotaxi_chat_" + data.tripId, JSON.stringify(next));
              }
            } catch (e) {
            }
            return next;
          });
        }
      } else if (type === "EMERGENCY_TRIGGERED") {
        const alertData = data && (data.payload || data.alert) || data;
        setEmergencyAlert(alertData);
        try {
          localStorage.setItem("puertotaxi_emergency_alert", JSON.stringify(alertData));
        } catch (e) {
        }
      } else if (type === "EMERGENCY_DEACTIVATED") {
        setEmergencyAlert(null);
        try {
          localStorage.removeItem("puertotaxi_emergency_alert");
        } catch (e) {
        }
      } else if (type === "DRIVER_UPDATE" || type === "DRIVER_UPDATED") {
        const drv = data && (data.payload || data.driver) || data;
        if (drv && drv.id) {
          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === drv.id);
            if (idx === -1) return [...prev, drv];
            const upd = [...prev];
            upd[idx] = { ...upd[idx], ...drv };
            return upd;
          });
        }
      }
    };
    let ch1 = null;
    let ch2 = null;
    if ("BroadcastChannel" in window) {
      try {
        ch1 = new BroadcastChannel("taxiclick_broadcast");
        ch1.onmessage = (ev) => {
          const { type } = ev.data || {};
          handleIncoming(type, ev.data);
        };
      } catch (e) {
      }
      try {
        ch2 = new BroadcastChannel("taxiclick_channel");
        ch2.onmessage = (ev) => {
          const { type } = ev.data || {};
          handleIncoming(type, ev.data);
        };
      } catch (e) {
      }
    }
    const handleStorage = (e) => {
      if (e.key === "puertotaxi_pending_request" || e.key === "taxiclick_pending_request") {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : null;
          if (roleRef.current === "DRIVER" || roleRef.current === "ADMIN_CENTRAL") {
            if (parsed) {
              const created = parsed.creadoEn || parsed.createdAt || Date.now();
              if (Date.now() - created < 15e3) {
                setPendingRequest((prev) => {
                  const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
                  const filtered = list.filter((item) => item && Date.now() - (item.creadoEn || item.createdAt || 0) < 15e3);
                  const exists = filtered.some((item) => item.firestoreId && parsed.firestoreId && item.firestoreId === parsed.firestoreId || item.id && parsed.id && item.id === parsed.id);
                  const next = exists ? filtered.map((item) => item.firestoreId && parsed.firestoreId && item.firestoreId === parsed.firestoreId || item.id && parsed.id && item.id === parsed.id ? { ...item, ...parsed } : item) : [...filtered, parsed];
                  next.sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0));
                  return next;
                });
                setDriverRequestCountdown(Math.max(0, Math.ceil((15e3 - (Date.now() - created)) / 1e3)));
                playBeep(880, 0.35);
              }
            }
          }
        } catch (err) {
        }
      } else if (e.key === "puertotaxi_active_trip" || e.key === "taxiclick_active_trip") {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : null;
          setActiveTrip(parsed);
          if (!parsed) {
            setChatMessages([]);
            sessionStorage.removeItem("puertotaxi_active_trip");
          } else {
            sessionStorage.setItem("puertotaxi_active_trip", JSON.stringify(parsed));
            playBeep(1100, 0.3);
          }
        } catch (err) {
        }
      } else if (e.key === "puertotaxi_cancelled_trip") {
        setActiveTrip(null);
        setChatMessages([]);
        try {
          localStorage.removeItem("puertotaxi_active_trip");
          localStorage.removeItem("taxiclick_active_trip");
          sessionStorage.removeItem("puertotaxi_active_trip");
        } catch (err) {
        }
      } else if (e.key === "puertotaxi_last_chat_msg" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed.message) {
            setChatMessages((prev) => {
              const exists = prev.some((m) => m.id && parsed.message.id && m.id === parsed.message.id || m.timestamp === parsed.message.timestamp && m.sender === parsed.message.sender);
              if (exists) return prev;
              return [...prev, parsed.message].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            });
          }
        } catch (err) {
        }
      } else if (e.key === "puertotaxi_emergency_alert") {
        try {
          setEmergencyAlert(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (err) {
        }
      }
    };
    const handleCustomReq = (e) => {
      if (e.detail && (roleRef.current === "DRIVER" || roleRef.current === "ADMIN_CENTRAL")) {
        const req = e.detail;
        const created = req.creadoEn || req.createdAt || Date.now();
        if (Date.now() - created < 15e3) {
          setPendingRequest((prev) => {
            const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
            const filtered = list.filter((item) => item && Date.now() - (item.creadoEn || item.createdAt || 0) < 15e3);
            const exists = filtered.some((item) => item.firestoreId && req.firestoreId && item.firestoreId === req.firestoreId || item.id && req.id && item.id === req.id);
            const next = exists ? filtered.map((item) => item.firestoreId && req.firestoreId && item.firestoreId === req.firestoreId || item.id && req.id && item.id === req.id ? { ...item, ...req } : item) : [...filtered, req];
            next.sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0));
            return next;
          });
          setDriverRequestCountdown(Math.max(0, Math.ceil((15e3 - (Date.now() - created)) / 1e3)));
        }
      }
    };
    const handleCustomCancel = () => {
      setPendingRequest(null);
      setDriverRequestCountdown(15);
    };
    const handleCustomAccept = (e) => {
      if (e.detail) {
        setPendingRequest(null);
        setActiveTrip(e.detail);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("taxiclick-new-request", handleCustomReq);
    window.addEventListener("taxiclick-cancel-request", handleCustomCancel);
    window.addEventListener("taxiclick-accept-trip", handleCustomAccept);
    return () => {
      if (ch1) ch1.close();
      if (ch2) ch2.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("taxiclick-new-request", handleCustomReq);
      window.removeEventListener("taxiclick-cancel-request", handleCustomCancel);
      window.removeEventListener("taxiclick-accept-trip", handleCustomAccept);
    };
  }, []);
  const [firebaseStatus, setFirebaseStatus] = useState(() => window.firebaseStatus || "initializing");
  useEffect(() => {
    const handleFbInit = (e) => {
      if (e.detail && e.detail.db) {
        setFirebaseStatus("connected");
      } else {
        setFirebaseStatus("offline");
      }
    };
    window.addEventListener("firebase-initialized", handleFbInit);
    if (window.firebaseDb) setFirebaseStatus("connected");
    const timeout = setTimeout(() => {
      setFirebaseStatus((prev) => prev === "initializing" ? "offline" : prev);
    }, 3500);
    return () => {
      window.removeEventListener("firebase-initialized", handleFbInit);
      clearTimeout(timeout);
    };
  }, []);
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS);
  const [activeTrip, setActiveTrip] = useState(() => {
    try {
      const saved = localStorage.getItem("puertotaxi_active_trip") || sessionStorage.getItem("puertotaxi_active_trip");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const activeTripRef = useRef(activeTrip);
  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);
  const [pendingRequest, setPendingRequest] = useState(() => {
    try {
      const saved = localStorage.getItem("puertotaxi_pending_request");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [requestCountdown, setRequestCountdown] = useState(15);
  const [driverRequestCountdown, setDriverRequestCountdown] = useState(15);
  const [emergencyAlert, setEmergencyAlert] = useState(() => {
    try {
      const saved = localStorage.getItem("puertotaxi_emergency_alert");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [phone, setPhone] = useState(() => {
    try {
      const p = localStorage.getItem("sesion_pasajero") || localStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("sesion_pasajero") || "";
      if (p) return p;
      const savedTrip = localStorage.getItem("puertotaxi_active_trip") || sessionStorage.getItem("puertotaxi_active_trip");
      if (savedTrip) {
        const parsedTrip = JSON.parse(savedTrip);
        if (parsedTrip && parsedTrip.passengerPhone) return String(parsedTrip.passengerPhone);
      }
      return "";
    } catch (e) {
      return "";
    }
  });
  const [storageType, setStorageType] = useState(() => {
    try {
      const sessionSaved = sessionStorage.getItem("puertotaxi_storage_type") || sessionStorage.getItem("tipo_de_almacenamiento_puertotaxi");
      if (sessionSaved === "session" || sessionSaved === "sesion") return "session";
      const localSaved = localStorage.getItem("sesion_pasajero") ? "local" : localStorage.getItem("puertotaxi_storage_type") || localStorage.getItem("tipo_de_almacenamiento_puertotaxi");
      if (localSaved === "local") return "local";
      if (sessionSaved) return sessionSaved;
      return "local";
    } catch (e) {
      return "local";
    }
  });
  const [passengerZone, setPassengerZone] = useState("Puntarenas Centro");
  const [exactAddress, setExactAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("SINPE");
  const [hasPet, setHasPet] = useState(false);
  const [mariaStyle, setMariaStyle] = useState("TIQUETE Y FECHA AL D\xCDA");
  const [unitType, setUnitType] = useState("CUALQUIERA");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(() => {
    try {
      const sessionPhone = sessionStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("sesion_pasajero") || sessionStorage.getItem("tel\xE9fono de taxi puerto") || sessionStorage.getItem("telefono_de_taxi_puerto");
      if (sessionPhone && String(sessionPhone).replace(/\D/g, "").length >= 8) {
        return true;
      }
      const sesion = localStorage.getItem("sesion_pasajero") || localStorage.getItem("puertotaxi_phone");
      return Boolean(sesion && String(sesion).replace(/\D/g, "").length >= 8);
    } catch (e) {
      return false;
    }
  });
  const [verificationLink, setVerificationLink] = useState("");
  const [generatedPin, setGeneratedPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [passengerFormError, setPassengerFormError] = useState("");
  const [userConfirmedMsg, setUserConfirmedMsg] = useState(null);
  const [prodhabAccepted, setProdhabAccepted] = useState(() => {
    try {
      return Boolean(localStorage.getItem("sesion_pasajero") || localStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("puertotaxi_phone"));
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    let isMounted = true;
    const initPassengerSession = async () => {
      try {
        const storedSesion = localStorage.getItem("sesion_pasajero");
        const savedPhone = storedSesion || localStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("puertotaxi_phone") || sessionStorage.getItem("sesion_pasajero") || phone;
        if (!savedPhone) return;
        const cleanDigits = String(savedPhone).replace(/\D/g, "");
        if (cleanDigits.length < 8) return;
        const telefono = String(cleanDigits);
        if (isMounted) {
          setIsPhoneVerified(true);
          setPhone(String(telefono));
          setProdhabAccepted(true);
          setRole((prev) => prev === null || prev === "PASSENGER" ? "PASSENGER" : prev);
        }
        if (window.firebaseDb && window.firebaseOps) {
          const { doc, getDoc } = window.firebaseOps;
          if (doc && getDoc) {
            const docRef = doc(window.firebaseDb, "registro_pasajeros", String(telefono));
            const docSnap = await getDoc(docRef);
            if (docSnap && docSnap.exists() && isMounted) {
              const data = docSnap.data();
              if (data) {
                const localAlreadySaved = Boolean(storedSesion) || localStorage.getItem("puertotaxi_storage_type") === "local";
                const saveDevice = data.saveDevice === true || data.saveDevice !== false && localAlreadySaved;
                setStorageType(saveDevice ? "local" : "sesion");
                setIsPhoneVerified(true);
                setPhone(String(telefono));
                setProdhabAccepted(true);
                setRole((prev) => prev === null || prev === "PASSENGER" ? "PASSENGER" : prev);
                if (saveDevice) {
                  localStorage.setItem("sesion_pasajero", String(telefono));
                  localStorage.setItem("puertotaxi_phone", String(telefono));
                  localStorage.setItem("puertotaxi_storage_type", "local");
                  sessionStorage.removeItem("puertotaxi_phone");
                } else {
                  localStorage.removeItem("sesion_pasajero");
                  sessionStorage.setItem("puertotaxi_phone", String(telefono));
                  sessionStorage.setItem("puertotaxi_storage_type", "sesion");
                  localStorage.removeItem("puertotaxi_phone");
                }
              }
            }
          }
        }
      } catch (e) {
      }
    };
    if (window.firebaseDb) {
      initPassengerSession();
    } else {
      window.addEventListener("firebase-initialized", initPassengerSession, { once: true });
    }
    return () => {
      isMounted = false;
      window.removeEventListener("firebase-initialized", initPassengerSession);
    };
  }, []);
  useEffect(() => {
    let isMounted = true;
    let unsubDriverDoc = null;
    const attachDriverLiveListener = () => {
      try {
        let driverId = loggedDriver && loggedDriver.id || null;
        if (!driverId) {
          const saved = localStorage.getItem("puertotaxi_logged_driver");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              driverId = parsed ? parsed.id : null;
            } catch (e) {
            }
          }
        }
        if (!driverId || driverId === "admin-central-puerto-taxi") return;
        const targetDocId = driverId;
        if (window.firebaseDb && window.firebaseOps) {
          const { doc, onSnapshot } = window.firebaseOps;
          const docRef = doc(window.firebaseDb, "flota_taxistas", String(targetDocId));
          unsubDriverDoc = onSnapshot(docRef, (docSnap) => {
            if (!isMounted) return;
            if (docSnap && docSnap.exists()) {
              const data = docSnap.data();
              const safeData = { ...data };
              delete safeData.password;
              const licensePlate = data.licensePlate || data.placa || "";
              const updatedDriver = {
                id: docSnap.id,
                ...safeData,
                name: data.name || data.nombre || "",
                licensePlate,
                placa: licensePlate,
                unitType: data.unitType || data.tipoUnidad || "SED\xC1N",
                currentZone: data.currentZone || "Puntarenas Centro",
                status: data.status || "DISPONIBLE",
                acceptsSinpe: data.acceptsSinpe === true,
                acceptsPets: data.acceptsPets === true,
                mariaStyle: data.mariaStyle || "TIQUETE Y FECHA AL D\xCDA",
                role: data.role || "driver"
              };
              setLoggedDriver((prev) => {
                const finalObj = prev ? { ...prev, ...updatedDriver } : updatedDriver;
                delete finalObj.password;
                try {
                  localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(finalObj));
                } catch (e) {
                }
                return finalObj;
              });
            }
          }, (err) => {
            console.warn("Error en oyente en vivo del taxista:", err);
          });
        }
      } catch (e) {
      }
    };
    if (window.firebaseDb) {
      attachDriverLiveListener();
    } else {
      window.addEventListener("firebase-initialized", attachDriverLiveListener, { once: true });
    }
    return () => {
      isMounted = false;
      if (unsubDriverDoc) unsubDriverDoc();
      window.removeEventListener("firebase-initialized", attachDriverLiveListener);
    };
  }, [loggedDriver?.id]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [isWaitingGps, setIsWaitingGps] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [emergencyGpsError, setEmergencyGpsError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [tripElapsedSec, setTripElapsedSec] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerAudioRef = useRef(null);
  const tripTimerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const playBeep = (freq = 880, duration = 0.25) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
    }
  };
  useEffect(() => {
    let isMounted = true;
    let unsubRequests = null;
    let unsubFleet = null;
    const setupRealtime = () => {
      if (!window.firebaseDb || !window.firebaseOps) return;
      try {
        const { collection, onSnapshot, doc, updateDoc } = window.firebaseOps;
        const colRef = collection(window.firebaseDb, "solicitudes_viaje");
        unsubRequests = onSnapshot(colRef, (snapshot) => {
          if (!isMounted) return;
          const allReqs = [];
          let active1033 = null;
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const item = {
              firestoreId: docSnap.id,
              id: d.id || docSnap.id,
              zone: d.zone || d.passengerZone || d.zona || "Puntarenas Centro",
              exactAddress: d.exactAddress || d.direccion || d.direccionExacta || "",
              paymentMethod: d.paymentMethod || (d.sinpe ? "SINPE" : "EFECTIVO") || "SINPE",
              hasPet: d.hasPet === true || d.hasPet === "CON_MASCOTA" || d.pets === true || d.con_mascota === true,
              mariaStyle: d.mariaStyle || d.maria || d.taximetro || "TIQUETE Y FECHA AL D\xCDA",
              unitType: d.unitType || d.tipoUnidad || d.unit || "SED\xC1N",
              ...d
            };
            if ((d.type === "EMERGENCY_10_33" || d.type === "10-33" || d.alerta_1033) && (d.alerta_activa === true || String(d.alerta_activa) === "true")) {
              if (!active1033 || (d.createdAt || 0) > (active1033.createdAt || 0)) {
                active1033 = item;
              }
            } else {
              allReqs.push(item);
            }
          });
          setEmergencyAlert(active1033);
          allReqs.sort((a, b) => (b.createdAt || b.creadoEn || 0) - (a.createdAt || a.creadoEn || 0));
          try {
            const currentActive = activeTripRef.current || JSON.parse(localStorage.getItem("puertotaxi_active_trip") || sessionStorage.getItem("puertotaxi_active_trip") || "null");
            if (currentActive && (currentActive.firestoreId || currentActive.id)) {
              const activeDocInDb = allReqs.find(
                (r) => currentActive.firestoreId && (r.firestoreId === currentActive.firestoreId || r.id === currentActive.firestoreId) || currentActive.id && (r.id === currentActive.id || r.firestoreId === currentActive.id)
              );
              if (activeDocInDb) {
                const stUpper = String(activeDocInDb.status || "").toUpperCase();
                if (stUpper === "COMPLETED" || stUpper === "CANCELLED" || stUpper === "CANCELLED_BY_PASSENGER" || stUpper === "FINALIZADO" || stUpper === "COMPLETADO" || stUpper === "CANCELADO" || stUpper === "CANCELADO_TIEMPO_DESACTIVADO") {
                  setActiveTrip(null);
                  setChatMessages([]);
                  try {
                    localStorage.removeItem("puertotaxi_active_trip");
                    localStorage.removeItem("taxiclick_active_trip");
                    sessionStorage.removeItem("puertotaxi_active_trip");
                  } catch (e) {
                  }
                } else if (!currentActive.firestoreId && activeDocInDb.firestoreId) {
                  const enriched = { ...currentActive, firestoreId: activeDocInDb.firestoreId };
                  setActiveTrip(enriched);
                  try {
                    localStorage.setItem("puertotaxi_active_trip", JSON.stringify(enriched));
                    sessionStorage.setItem("puertotaxi_active_trip", JSON.stringify(enriched));
                  } catch (e) {
                  }
                }
              }
            }
          } catch (e) {
          }
          try {
            const storedReq = JSON.parse(localStorage.getItem("puertotaxi_pending_request") || "null");
            if (storedReq && (storedReq.firestoreId || storedReq.id)) {
              const acceptedDoc = allReqs.find(
                (r) => cleanStr(r.status) === "accepted" && r.tripData && (r.firestoreId === storedReq.firestoreId || r.id === storedReq.id) && (r.createdAt && Date.now() - r.createdAt <= 15 * 60 * 1e3 || r.creadoEn && Date.now() - r.creadoEn <= 15 * 60 * 1e3 || !r.createdAt)
              );
              if (acceptedDoc && acceptedDoc.tripData) {
                const finalTrip = { ...acceptedDoc.tripData, firestoreId: acceptedDoc.firestoreId || acceptedDoc.tripData.firestoreId || acceptedDoc.id };
                setActiveTrip(finalTrip);
                setPendingRequest(null);
                localStorage.removeItem("puertotaxi_pending_request");
                localStorage.setItem("puertotaxi_active_trip", JSON.stringify(finalTrip));
                sessionStorage.setItem("puertotaxi_active_trip", JSON.stringify(finalTrip));
                playBeep(1100, 0.3);
                return;
              }
            }
          } catch (e) {
          }
          const now = Date.now();
          if (role === "DRIVER" || role === "ADMIN_CENTRAL") {
            const pendingList = allReqs.filter((r) => {
              const st = cleanStr(r.status);
              const isPending = st === "pending";
              const created = r.creadoEn || r.createdAt || 0;
              return isPending && created > 0 && now - created < 15e3 && r.status !== "CANCELADO_TIEMPO_DESACTIVADO" && r.status !== "CANCELLED";
            });
            pendingList.sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0));
            if (pendingList.length > 0) {
              setPendingRequest((prev) => {
                const prevArr = Array.isArray(prev) ? prev : prev ? [prev] : [];
                const hasNew = pendingList.some((item) => !prevArr.some((p) => p.firestoreId && item.firestoreId && p.firestoreId === item.firestoreId || p.id && item.id && p.id === item.id));
                if (hasNew) {
                  playBeep(880, 0.35);
                }
                return pendingList;
              });
              const firstCreated = pendingList[0].creadoEn || pendingList[0].createdAt || now;
              setDriverRequestCountdown(Math.max(0, Math.ceil((15e3 - (now - firstCreated)) / 1e3)));
            } else {
              setPendingRequest(null);
              setDriverRequestCountdown(15);
            }
          } else if (role === "PASSENGER") {
            try {
              const storedReq = JSON.parse(localStorage.getItem("puertotaxi_pending_request") || "null");
              if (storedReq && (storedReq.firestoreId || storedReq.id)) {
                const myReqInDb = allReqs.find((r) => r.firestoreId === storedReq.firestoreId || r.id === storedReq.id);
                if (myReqInDb && (myReqInDb.status === "CANCELADO_TIEMPO_DESACTIVADO" || myReqInDb.status === "CANCELLED")) {
                  setPendingRequest(null);
                  setRequestCountdown(15);
                  localStorage.removeItem("puertotaxi_pending_request");
                  localStorage.removeItem("taxiclick_pending_request");
                }
              }
            } catch (e) {
            }
          }
        }, () => {
        });
        const fleetRef = collection(window.firebaseDb, "flota_taxistas");
        unsubFleet = onSnapshot(fleetRef, (snapshot) => {
          if (!isMounted) return;
          const remoteFleet = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docRole = String(data.role || "").toLowerCase();
            const docStatus = String(data.status || "").toUpperCase();
            const safeData = { ...data };
            delete safeData.password;
            if (docRole === "admin" || docStatus === "CENTRAL") {
              const adminData = {
                id: docSnap.id,
                ...safeData,
                name: data.name || data.nombre || "Central de Radio Puerto Taxi",
                role: "admin",
                status: "CENTRAL",
                licensePlate: "CENTRAL",
                placa: "CENTRAL",
                unitType: "N/A",
                currentZone: data.currentZone || "Puntarenas Centro"
              };
              if (isAdmin || loggedDriver && (loggedDriver.id === docSnap.id || loggedDriver.id === "admin-central-puerto-taxi" || String(loggedDriver.email || "").toLowerCase() === "taxiclickpuntarenas@gmail.com")) {
                setLoggedDriver((prev) => {
                  const nextAdmin = { ...prev || {}, ...adminData };
                  delete nextAdmin.password;
                  return nextAdmin;
                });
              }
              return;
            }
            const plate = data.licensePlate || data.placa || data.numeroPlaca || data.placaOficial || "";
            const driverData = {
              id: docSnap.id,
              ...safeData,
              name: data.name || data.nombre || "",
              placa: plate,
              licensePlate: plate,
              unitType: data.unitType || data.tipoUnidad || "SED\xC1N",
              currentZone: data.currentZone || "Puntarenas Centro",
              status: data.status || "DISPONIBLE",
              acceptsSinpe: data.acceptsSinpe === true,
              acceptsPets: data.acceptsPets === true,
              mariaStyle: data.mariaStyle || "TIQUETE Y FECHA AL D\xCDA",
              role: "driver"
            };
            remoteFleet.push(driverData);
          });
          setDrivers(remoteFleet);
          setLoggedDriver((prevLogged) => {
            if (!prevLogged || !prevLogged.id || prevLogged.id === "admin-central-puerto-taxi" || String(prevLogged.role || "").toLowerCase() === "admin") return prevLogged;
            const matchedRemote = remoteFleet.find(
              (d) => d.id === prevLogged.id || d.email && prevLogged.email && String(d.email).toLowerCase().trim() === String(prevLogged.email).toLowerCase().trim()
            );
            if (matchedRemote) {
              const updatedLogged = {
                ...prevLogged,
                ...matchedRemote,
                name: matchedRemote.name || prevLogged.name,
                placa: matchedRemote.licensePlate || prevLogged.licensePlate,
                licensePlate: matchedRemote.licensePlate || prevLogged.licensePlate,
                unitType: matchedRemote.unitType || prevLogged.unitType,
                currentZone: matchedRemote.currentZone || prevLogged.currentZone,
                status: matchedRemote.status || prevLogged.status,
                acceptsSinpe: matchedRemote.acceptsSinpe === true,
                acceptsPets: matchedRemote.acceptsPets === true,
                mariaStyle: matchedRemote.mariaStyle || prevLogged.mariaStyle
              };
              try {
                localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(updatedLogged));
              } catch (e) {
              }
              return updatedLogged;
            }
            return prevLogged;
          });
        }, () => {
        });
      } catch (err) {
      }
    };
    if (window.firebaseDb) {
      setupRealtime();
    } else {
      window.addEventListener("firebase-initialized", setupRealtime, { once: true });
    }
    return () => {
      isMounted = false;
      if (unsubRequests) unsubRequests();
      if (unsubFleet) unsubFleet();
    };
  }, [role]);
  useEffect(() => {
    let isMounted = true;
    let unsub = null;
    if (!activeTrip) {
      return () => {
      };
    }
    const tripDocId = activeTrip.firestoreId || activeTrip.id;
    try {
      const cachedMsgs = localStorage.getItem("puertotaxi_chat_" + tripDocId);
      if (cachedMsgs) {
        const parsedMsgs = JSON.parse(cachedMsgs);
        if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
          setChatMessages(parsedMsgs);
        } else if (activeTrip.messages) {
          setChatMessages(activeTrip.messages);
        }
      } else if (activeTrip.messages) {
        setChatMessages(activeTrip.messages);
      }
    } catch (e) {
      if (activeTrip.messages) setChatMessages(activeTrip.messages);
    }
    const attachChatListener = () => {
      if (!isMounted || !activeTrip || !window.firebaseDb || !window.firebaseOps) return;
      if (unsub) {
        try {
          unsub();
        } catch (e) {
        }
        unsub = null;
      }
      try {
        const { collection, onSnapshot, deleteDoc, doc } = window.firebaseOps;
        const msgsRef = collection(window.firebaseDb, "solicitudes_viaje", String(tripDocId), "mensajes");
        unsub = onSnapshot(msgsRef, (snap) => {
          if (!isMounted) return;
          const remoteList = [];
          const TEN_MIN_MS = 10 * 60 * 1e3;
          const currentMs = Date.now();
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.timestamp && currentMs - data.timestamp < TEN_MIN_MS) {
              remoteList.push({ id: docSnap.id, ...data, firestoreMsgId: docSnap.id });
            } else if (data.timestamp && currentMs - data.timestamp >= TEN_MIN_MS) {
              try {
                deleteDoc(doc(window.firebaseDb, "solicitudes_viaje", String(tripDocId), "mensajes", docSnap.id)).catch(() => {
                });
              } catch (e) {
              }
            }
          });
          setChatMessages((prev) => {
            let localCached = [];
            try {
              const raw = localStorage.getItem("puertotaxi_chat_" + tripDocId);
              if (raw) localCached = JSON.parse(raw) || [];
            } catch (e) {
            }
            const combinedSource = [...remoteList];
            const mergePool = [...Array.isArray(prev) ? prev : [], ...Array.isArray(localCached) ? localCached : [], ...Array.isArray(activeTrip.messages) ? activeTrip.messages : []];
            mergePool.forEach((item) => {
              if (!item) return;
              if (item.timestamp && currentMs - item.timestamp >= TEN_MIN_MS) return;
              const alreadyIn = combinedSource.some(
                (r) => r.id && item.id && r.id === item.id || r.timestamp && item.timestamp && Math.abs(r.timestamp - item.timestamp) < 1500 && r.sender === item.sender && (r.text && r.text === item.text || r.audioData && item.audioData)
              );
              if (!alreadyIn) {
                combinedSource.push(item);
              }
            });
            combinedSource.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            try {
              localStorage.setItem("puertotaxi_chat_" + tripDocId, JSON.stringify(combinedSource));
            } catch (e) {
            }
            return combinedSource;
          });
        }, () => {
        });
      } catch (e) {
      }
    };
    if (window.firebaseDb && window.firebaseOps) {
      attachChatListener();
    } else {
      window.addEventListener("firebase-initialized", attachChatListener, { once: true });
    }
    return () => {
      isMounted = false;
      if (unsub) {
        try {
          unsub();
        } catch (e) {
        }
      }
      window.removeEventListener("firebase-initialized", attachChatListener);
    };
  }, [activeTrip && (activeTrip.firestoreId || activeTrip.id), firebaseStatus]);
  useEffect(() => {
    if (activeTrip) {
      const updateElapsed = () => {
        const elapsed = Math.max(0, Math.floor((Date.now() - (activeTrip.startedAt || Date.now())) / 1e3));
        setTripElapsedSec(elapsed);
        if (elapsed >= 600) {
          manejarCompletarOFinalizarViaje();
        }
      };
      updateElapsed();
      tripTimerRef.current = setInterval(updateElapsed, 1e3);
    } else {
      setTripElapsedSec(0);
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
    }
    return () => {
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
    };
  }, [activeTrip]);
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);
  const getCostaRicaDate = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Costa_Rica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(/* @__PURE__ */ new Date());
    } catch (e) {
      return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    }
  };
  useEffect(() => {
    let interval = null;
    if (pendingRequest && role === "PASSENGER") {
      const startTime = pendingRequest.creadoEn || pendingRequest.createdAt || Date.now();
      const checkTimeout = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1e3);
        const remaining = Math.max(0, 15 - elapsed);
        setRequestCountdown(remaining);
        if (elapsed >= 15 || remaining <= 0) {
          if (interval) clearInterval(interval);
          const reqToCancel = pendingRequest;
          setPendingRequest(null);
          setRequestCountdown(15);
          try {
            localStorage.removeItem("puertotaxi_pending_request");
            localStorage.removeItem("taxiclick_pending_request");
          } catch (e) {
          }
          if (window.firebaseDb && window.firebaseOps && reqToCancel && reqToCancel.firestoreId) {
            const { doc, updateDoc } = window.firebaseOps;
            updateDoc(doc(window.firebaseDb, "solicitudes_viaje", reqToCancel.firestoreId), {
              status: "CANCELADO_TIEMPO_DESACTIVADO",
              cancelledAt: Date.now()
            }).catch(() => {
            });
          }
          if (typeof window !== "undefined") {
            if ("BroadcastChannel" in window) {
              try {
                const bc = new BroadcastChannel("taxiclick_broadcast");
                bc.postMessage({ type: "CANCEL_REQUEST", requestId: reqToCancel ? reqToCancel.id : null });
                bc.close();
              } catch (e) {
              }
              try {
                const bc2 = new BroadcastChannel("taxiclick_channel");
                bc2.postMessage({ type: "CANCEL_REQUEST", requestId: reqToCancel ? reqToCancel.id : null });
                bc2.close();
              } catch (e) {
              }
            }
            try {
              window.dispatchEvent(new CustomEvent("taxiclick-cancel-request"));
            } catch (e) {
            }
          }
          setUserConfirmedMsg('La solicitud permaneci\xF3 activa 15 segundos y ning\xFAn taxista la acept\xF3 a tiempo. El bot\xF3n se ha liberado; puedes presionar "SOLICITAR TAXI AHORA" para reintentar el servicio.');
          playBeep(440, 0.3);
        }
      };
      checkTimeout();
      interval = setInterval(checkTimeout, 250);
    } else {
      setRequestCountdown(15);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingRequest?.id, pendingRequest?.creadoEn, pendingRequest?.createdAt, role]);
  useEffect(() => {
    let interval = null;
    const hasPending = Array.isArray(pendingRequest) ? pendingRequest.length > 0 : Boolean(pendingRequest);
    if (hasPending && (role === "DRIVER" || role === "ADMIN_CENTRAL")) {
      const tickDriver = () => {
        const nowMs = Date.now();
        setPendingRequest((prev) => {
          if (!prev) return null;
          const list = Array.isArray(prev) ? prev : [prev];
          const active = list.filter((item) => {
            if (!item) return false;
            const created = item.creadoEn || item.createdAt || nowMs;
            return nowMs - created < 15e3;
          });
          if (active.length === 0) {
            setDriverRequestCountdown(15);
            return null;
          }
          active.sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0));
          const firstCreated = active[0].creadoEn || active[0].createdAt || nowMs;
          const firstRemaining = Math.max(0, 15 - Math.floor((nowMs - firstCreated) / 1e3));
          setDriverRequestCountdown(firstRemaining);
          return active;
        });
      };
      tickDriver();
      interval = setInterval(tickDriver, 250);
    } else {
      setDriverRequestCountdown(15);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [Array.isArray(pendingRequest) ? pendingRequest.length : pendingRequest?.id, role]);
  useEffect(() => {
    let isMounted = true;
    let unsub = null;
    const attachRemoteTripListener = () => {
      if (!isMounted || !activeTrip || !window.firebaseDb || !window.firebaseOps) return;
      if (unsub) {
        try {
          unsub();
        } catch (e) {
        }
        unsub = null;
      }
      try {
        const tripDocId = activeTrip.firestoreId || activeTrip.id;
        const { doc, onSnapshot } = window.firebaseOps;
        const tripRef = doc(window.firebaseDb, "solicitudes_viaje", String(tripDocId));
        unsub = onSnapshot(tripRef, (snap) => {
          if (!isMounted) return;
          if (snap.exists()) {
            const data = snap.data();
            const st = String(data.status || "").toUpperCase();
            if (st === "COMPLETED" || st === "CANCELLED" || st === "CANCELLED_BY_PASSENGER" || st === "FINALIZADO" || st === "COMPLETADO" || st === "CANCELADO" || st === "CANCELADO_TIEMPO_DESACTIVADO") {
              manejarCompletarOFinalizarViaje();
            }
          }
        }, () => {
        });
      } catch (e) {
      }
    };
    if (window.firebaseDb && window.firebaseOps) {
      attachRemoteTripListener();
    } else {
      window.addEventListener("firebase-initialized", attachRemoteTripListener, { once: true });
    }
    return () => {
      isMounted = false;
      if (unsub) {
        try {
          unsub();
        } catch (e) {
        }
      }
      window.removeEventListener("firebase-initialized", attachRemoteTripListener);
    };
  }, [activeTrip && (activeTrip.firestoreId || activeTrip.id), firebaseStatus]);
  useEffect(() => {
    const todayCR = getCostaRicaDate();
    const savedPurge = localStorage.getItem("puertotaxi_last_cr_purge");
    const runMidnightPurge = async () => {
      setPendingRequest(null);
      setActiveTrip(null);
      try {
        localStorage.removeItem("puertotaxi_pending_request");
        localStorage.removeItem("taxiclick_pending_request");
        localStorage.removeItem("puertotaxi_active_trip");
        localStorage.removeItem("taxiclick_active_trip");
      } catch (e) {
      }
      localStorage.setItem("puertotaxi_last_cr_purge", todayCR);
      if (window.firebaseDb && window.firebaseOps) {
        const { collection, getDocs, deleteDoc, doc } = window.firebaseOps;
        try {
          const solRef = collection(window.firebaseDb, "solicitudes_viaje");
          const solSnap = await getDocs(solRef);
          const oneHourAgo = Date.now() - 60 * 60 * 1e3;
          solSnap.forEach(async (dSnap) => {
            const data = dSnap.data();
            if (!data.createdAt || data.createdAt < oneHourAgo || data.status === "CANCELLED" || data.status === "COMPLETED" || data.status === "CANCELLED_TIMEOUT" || data.status === "CANCELADO_TIEMPO_DESACTIVADO") {
              await deleteDoc(doc(window.firebaseDb, "solicitudes_viaje", dSnap.id)).catch(() => {
              });
            }
          });
          const regRef = collection(window.firebaseDb, "registro_pasajeros");
          const regSnap = await getDocs(regRef);
          regSnap.forEach(async (dSnap) => {
            const data = dSnap.data();
            if (data.saveDevice === false || data.tipo_guardado === "sesion") {
              await deleteDoc(doc(window.firebaseDb, "registro_pasajeros", dSnap.id)).catch(() => {
              });
            }
          });
          console.log("\u26A1 Purga de Medianoche ejecutada (12:00 m.n. Costa Rica).");
        } catch (e) {
        }
      }
    };
    if (savedPurge && savedPurge !== todayCR) {
      runMidnightPurge();
    } else if (!savedPurge) {
      localStorage.setItem("puertotaxi_last_cr_purge", todayCR);
    }
    const midnightChecker = setInterval(() => {
      const currentCR = getCostaRicaDate();
      if (currentCR !== localStorage.getItem("puertotaxi_last_cr_purge")) {
        runMidnightPurge();
      }
    }, 3e4);
    return () => clearInterval(midnightChecker);
  }, []);
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hasTel = urlParams.has("telefono") || urlParams.has("phone");
      const hasCode = urlParams.has("code") || urlParams.has("pin");
      const status = urlParams.get("status");
      if (hasTel || hasCode || status) {
        const rawTel = urlParams.get("telefono") || urlParams.get("phone") || "";
        const rawCode = urlParams.get("code") || urlParams.get("pin") || "";
        const cleanPhone = rawTel.replace(/\D/g, "");
        const cleanCode = rawCode.replace(/\D/g, "");
        const isValidStructure = cleanPhone.length === 8 && (cleanCode.length === 4 || status === "validado");
        const referrer = (document.referrer || "").toLowerCase();
        const isAuthorizedOrigin = !referrer || referrer.includes("ciudadavatarpuntarenas.com") || referrer.includes("confirmacion-de-usuario") || referrer.includes(window.location.host);
        if (isValidStructure && isAuthorizedOrigin) {
          setPhone(cleanPhone);
          if (cleanCode) {
            setGeneratedPin(cleanCode);
            setPinInput(cleanCode);
          }
          setRole("PASSENGER");
          setProdhabAccepted(true);
          setIsVerifying(true);
          setIsPhoneVerified(false);
          setUserConfirmedMsg(`C\xF3digo ${cleanCode} recibido desde WhatsApp. Valida tu acreditaci\xF3n para proceder a pedir taxi.`);
          playBeep(920, 0.3);
        } else {
          setRole("PASSENGER");
          setPassengerFormError("Intento de validaci\xF3n rechazado: El enlace no cumple con la estructura oficial requerida (https://link.ciudadavatarpuntarenas.com/confirmacion-de-usuario?telefono=...&code=...).");
          playBeep(440, 0.4);
        }
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }, []);
  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  const publicPassengerId = useMemo(() => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length >= 4) {
      return `Pasajero #${clean.slice(-4)}`;
    }
    return `Pasajero #${Math.floor(1e3 + Math.random() * 9e3)}`;
  }, [phone]);
  const cleanStr = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function normalizeZoneCanonical(z) {
    const s = String(z || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!s) return "";
    if (s.includes("carmen")) return "Barrio El Carmen";
    if (s.includes("cocal")) return "El Cocal";
    if (s.includes("chacarita")) return "La Gran Chacarita";
    if (s.includes("boli")) return "El Boli";
    if (s.includes("hospital")) return "Ant. Hospital y alrededores";
    if (s.includes("caldera")) return "Caldera";
    if (s.includes("roble") || s.includes("jireth")) return "El Roble-Jireth";
    if (s.includes("palma") || s.includes("plama") || s.includes("juanito")) return "Alrededores de Plamas-JuanitoMora";
    if (s.includes("cecilia") || s.includes("almedro") || s.includes("almendro") || s.includes("santa rosa")) return "Do\xF1a Cecilia-Almedros-Santa Rosa";
    if (s.includes("barranca") || s.includes("barrranca") || s.includes("feria") || s.includes("cruce")) return "Feria-BarrrancaCentro-Cruce";
    if (s.includes("costanera") || s.includes("reseda") || s.includes("chaguite")) return "Costanera-Reseda-Chaguite";
    if (s.includes("centro")) return "Puntarenas Centro";
    return s;
  }
  function matchesDriverFilters(driver, criteria) {
    if (!driver) return false;
    const driverStatus = String(driver.status || "").trim().toUpperCase();
    if (driverStatus !== "DISPONIBLE") return false;
    const driverCurrentZone = String(driver.currentZone || "").trim();
    const passengerReqZone = String(criteria.zone || "").trim();
    if (driverCurrentZone !== passengerReqZone && normalizeZoneCanonical(driverCurrentZone) !== normalizeZoneCanonical(passengerReqZone)) {
      return false;
    }
    const critPay = String(criteria.paymentMethod || "").trim().toUpperCase();
    if (critPay === "SINPE") {
      if (driver.acceptsSinpe !== true) return false;
    }
    const reqPet = criteria.hasPet === true || String(criteria.hasPet || "").trim().toUpperCase() === "CON_MASCOTA";
    if (reqPet) {
      if (driver.acceptsPets !== true) return false;
    }
    const critMaria = String(criteria.mariaStyle || "").trim().toUpperCase();
    if (critMaria !== "CUALQUIERA" && critMaria !== "") {
      const drivMaria = String(driver.mariaStyle || "").trim().toUpperCase();
      if (drivMaria !== "CUALQUIERA" && drivMaria !== "") {
        const critTicket = critMaria.includes("TIQUETE") && (critMaria.includes("D\xCDA") || critMaria.includes("DIA") || critMaria.includes("CON"));
        const drivTicket = drivMaria.includes("TIQUETE") && (drivMaria.includes("D\xCDA") || drivMaria.includes("DIA") || drivMaria.includes("CON"));
        if (critTicket !== drivTicket) return false;
      }
    }
    const critUnit = String(criteria.unitType || "").trim().toUpperCase();
    const drivUnit = String(driver.unitType || "").trim().toUpperCase();
    if (critUnit !== "CUALQUIERA" && critUnit !== "") {
      if (critUnit.includes("VAN") || critUnit.includes("MICROB\xDAS") || critUnit.includes("MICROBUS")) {
        if (!drivUnit.includes("VAN") && !drivUnit.includes("MICROB\xDAS") && !drivUnit.includes("MICROBUS")) {
          return false;
        }
      } else if (drivUnit !== critUnit) {
        return false;
      }
    }
    return true;
  }
  const availableFilteredDriversCount = useMemo(() => {
    let pool = [...drivers];
    if (loggedDriver && loggedDriver.id) {
      const idx = pool.findIndex((d) => d.id === loggedDriver.id || d.email && cleanStr(d.email) === cleanStr(loggedDriver.email));
      if (idx === -1) {
        pool.push(loggedDriver);
      } else {
        pool[idx] = { ...pool[idx], ...loggedDriver };
      }
    }
    return pool.filter((d) => matchesDriverFilters(d, {
      zone: passengerZone,
      paymentMethod,
      hasPet,
      mariaStyle,
      unitType
    })).length;
  }, [drivers, loggedDriver, passengerZone, paymentMethod, hasPet, mariaStyle, unitType]);
  const handleEscapeToPassengers = () => {
    setRole(null);
  };
  const handleLogoutDriver = () => {
    setDriverAuthenticated(false);
    setLoggedDriver(null);
    try {
      localStorage.removeItem("puertotaxi_driver_auth");
      localStorage.removeItem("puertotaxi_logged_driver");
    } catch (e) {
    }
    setRole(null);
  };
  const handleLoginDriver = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setLoginError("");
    const emailTrim = loginEmail.trim().toLowerCase();
    const passTrim = loginPassword.trim();
    if (!emailTrim || !passTrim) {
      setLoginError("Por favor ingresa correo y contrase\xF1a.");
      return;
    }
    setLoginLoading(true);
    let match = null;
    if (window.firebaseDb && window.firebaseOps) {
      const { collection, getDocs, query, where } = window.firebaseOps;
      try {
        const q = query(
          collection(window.firebaseDb, "flota_taxistas"),
          where("email", "==", emailTrim)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            const docPass = String(data.password || "").trim();
            if (docPass === passTrim) {
              const plate = data.placa || data.licensePlate || data.numeroPlaca || data.placaOficial || "";
              const safeData = { ...data };
              delete safeData.password;
              match = {
                id: docSnap.id,
                ...safeData,
                placa: plate,
                licensePlate: plate
              };
            }
          });
        } else {
          const allDocsSnap = await getDocs(collection(window.firebaseDb, "flota_taxistas"));
          allDocsSnap.forEach((docSnap) => {
            const data = docSnap.data();
            const docEmail = String(data.email || "").trim().toLowerCase();
            const docPass = String(data.password || "").trim();
            if (docEmail === emailTrim && docPass === passTrim) {
              const plate = data.placa || data.licensePlate || data.numeroPlaca || data.placaOficial || "";
              const safeData = { ...data };
              delete safeData.password;
              match = {
                id: docSnap.id,
                ...safeData,
                placa: plate,
                licensePlate: plate
              };
            }
          });
        }
      } catch (queryErr) {
        try {
          const fallbackSnap = await getDocs(collection(window.firebaseDb, "flota_taxistas"));
          fallbackSnap.forEach((docSnap) => {
            const data = docSnap.data();
            const docEmail = String(data.email || "").trim().toLowerCase();
            const docPass = String(data.password || "").trim();
            if (docEmail === emailTrim && docPass === passTrim) {
              const plate = data.placa || data.licensePlate || data.numeroPlaca || data.placaOficial || "";
              const safeData = { ...data };
              delete safeData.password;
              match = {
                id: docSnap.id,
                ...safeData,
                placa: plate,
                licensePlate: plate
              };
            }
          });
        } catch (fallbackErr) {
          setLoginError("Error al consultar Firestore. Verifica la conexi\xF3n con la base de datos.");
        }
      }
    } else {
      setLoginError("Conectando con Firestore... Por favor espera un momento e intenta de nuevo.");
    }
    if (match) {
      const userRole = String(match.role || "").trim().toLowerCase();
      const userStatus = String(match.status || "").trim().toUpperCase();
      const isUserAdmin = userRole === "admin" || userStatus === "CENTRAL" || String(match.email || "").trim().toLowerCase() === "taxiclickpuntarenas@gmail.com";
      if (isUserAdmin) {
        setDriverAuthenticated(true);
        setLoggedDriver(match);
        try {
          localStorage.setItem("puertotaxi_driver_auth", "true");
          localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(match));
        } catch (e2) {
        }
        setRole("ADMIN_CENTRAL");
        setIsWaitingGps(false);
        setLoginLoading(false);
        playBeep(1050, 0.25);
        return;
      }
      setIsWaitingGps(true);
      const activateDriverConsole = (coords) => {
        const finalDriver = coords ? { ...match, lastLat: coords.lat, lastLng: coords.lng } : match;
        setDriverAuthenticated(true);
        setLoggedDriver(finalDriver);
        try {
          localStorage.setItem("puertotaxi_driver_auth", "true");
          localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(finalDriver));
        } catch (e2) {
        }
        setRole("DRIVER");
        setIsWaitingGps(false);
        setLoginLoading(false);
        playBeep(980, 0.2);
      };
      if (!navigator.geolocation) {
        setLoginError("Error de hardware: Su dispositivo o navegador no admite geolocalizaci\xF3n GPS. Es obligatorio para ingresar al turno oficial.");
        setLoginLoading(false);
        setIsWaitingGps(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(5);
          const lng = pos.coords.longitude.toFixed(5);
          activateDriverConsole({ lat, lng });
        },
        (err) => {
          let msg = "Acceso bloqueado: Debe activar el GPS y conceder permisos de ubicaci\xF3n para acceder a su turno oficial de taxista.";
          if (err && err.code === 1) {
            msg = "Acceso bloqueado: Permiso de ubicaci\xF3n denegado. Es obligatorio habilitar el GPS en su navegador o dispositivo para ingresar al turno oficial.";
          } else if (err && err.code === 2) {
            msg = "Acceso bloqueado: Se\xF1al GPS no disponible o desactivada. Active la ubicaci\xF3n en su dispositivo para ingresar al turno oficial.";
          } else if (err && err.code === 3) {
            msg = "Acceso bloqueado: Tiempo de espera de GPS agotado. Active el GPS en modo de alta precisi\xF3n y vuelva a intentar.";
          }
          setLoginError(msg);
          setDriverAuthenticated(false);
          setLoggedDriver(null);
          setLoginLoading(false);
          setIsWaitingGps(false);
          playBeep(330, 0.4);
        },
        {
          enableHighAccuracy: true,
          timeout: 1e4,
          maximumAge: 0
        }
      );
    } else {
      setLoginLoading(false);
      setIsWaitingGps(false);
      if (!loginError) {
        setLoginError("Credenciales incorrectas o taxista no registrado en la flota oficial de Firestore.");
      }
    }
  };
  const handleTriggerSilentEmergency = async () => {
    setEmergencyGpsError("");
    let lat = "";
    let lng = "";
    try {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
              enableHighAccuracy: true,
              timeout: 1e4,
              maximumAge: 0
            }
          );
        }).catch(() => null);
        if (pos && pos.coords) {
          lat = pos.coords.latitude.toFixed(6);
          lng = pos.coords.longitude.toFixed(6);
          if (loggedDriver) {
            setLoggedDriver((prev) => prev ? { ...prev, lastLat: lat, lastLng: lng } : prev);
          }
        }
      }
    } catch (e) {
    }
    if (!lat || !lng) {
      setEmergencyGpsError("Error de sensor GPS por hardware: No se pudo obtener la posici\xF3n satelital en vivo. Por favor ub\xEDcate en un espacio abierto y vuelve a pulsar el Bot\xF3n de Emergencia 10-33.");
      playBeep(330, 0.4);
      return;
    }
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const alertPlate = loggedDriver ? loggedDriver.placa || loggedDriver.licensePlate || "" : "";
    const alertData = {
      type: "EMERGENCY_10_33",
      alerta_activa: true,
      driverName: loggedDriver ? loggedDriver.name || "Erlin R." : "Erlin R.",
      driverId: loggedDriver ? loggedDriver.id : "driver-emergency",
      licensePlate: alertPlate,
      placa: alertPlate,
      currentAddress: `GPS Hardware en vivo: (${lat}, ${lng})`,
      zone: `GPS en Vivo: (${lat}, ${lng})`,
      lat,
      lng,
      googleMapsUrl,
      createdAt: Date.now()
    };
    let firestoreDocId = null;
    try {
      if (window.firebaseDb && window.firebaseOps) {
        const { collection, addDoc } = window.firebaseOps;
        const docRef = await addDoc(collection(window.firebaseDb, "solicitudes_viaje"), alertData);
        if (docRef && docRef.id) {
          firestoreDocId = docRef.id;
        }
      }
    } catch (e) {
    }
    const finalAlertData = firestoreDocId ? { ...alertData, firestoreId: firestoreDocId } : alertData;
    setEmergencyAlert(finalAlertData);
    try {
      localStorage.setItem("puertotaxi_emergency_alert", JSON.stringify(finalAlertData));
    } catch (e) {
    }
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        const ch = new BroadcastChannel("taxiclick_broadcast");
        ch.postMessage({ type: "EMERGENCY_TRIGGERED", payload: finalAlertData });
        ch.close();
      }
    } catch (e) {
    }
    playBeep(440, 0.8);
  };
  const handleDeactivateEmergencyCentral = async () => {
    const targetAlert = emergencyAlert;
    setEmergencyAlert(null);
    try {
      localStorage.removeItem("puertotaxi_emergency_alert");
    } catch (e) {
    }
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        const ch = new BroadcastChannel("taxiclick_broadcast");
        ch.postMessage({ type: "EMERGENCY_DEACTIVATED", payload: null });
        ch.close();
      }
    } catch (e) {
    }
    if (window.firebaseDb && window.firebaseOps) {
      const { doc, updateDoc, collection, getDocs } = window.firebaseOps;
      try {
        const targetDocId = targetAlert ? targetAlert.firestoreId || targetAlert.id : null;
        if (targetDocId) {
          await updateDoc(doc(window.firebaseDb, "solicitudes_viaje", targetDocId), {
            alerta_activa: false,
            deactivatedAt: Date.now()
          }).catch(() => {
          });
        }
        const snap = await getDocs(collection(window.firebaseDb, "solicitudes_viaje"));
        snap.forEach(async (dSnap) => {
          const d = dSnap.data();
          if (d && (d.alerta_activa === true || String(d.alerta_activa) === "true")) {
            await updateDoc(doc(window.firebaseDb, "solicitudes_viaje", dSnap.id), {
              alerta_activa: false,
              deactivatedAt: Date.now()
            }).catch(() => {
            });
          }
        });
      } catch (e) {
      }
    }
  };
  const handleStartPassengerVerification = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setPassengerFormError("");
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 8) {
      setPassengerFormError("Por favor ingresa un n\xFAmero de tel\xE9fono v\xE1lido de 8 d\xEDgitos.");
      return;
    }
    if (!prodhabAccepted) {
      setPassengerFormError("Debes aceptar la Pol\xEDtica de Privacidad de la Ley PRODHAB N.\xB0 8968.");
      return;
    }
    const isSaveDevice = storageType === "local";
    try {
      if (isSaveDevice) {
        localStorage.setItem("sesion_pasajero", cleanPhone);
        localStorage.setItem("puertotaxi_phone", cleanPhone);
        localStorage.setItem("tel\xE9fono de taxi puerto", cleanPhone);
        localStorage.setItem("puertotaxi_storage_type", "local");
        localStorage.setItem("tipo_de_almacenamiento_puertotaxi", "local");
        sessionStorage.removeItem("puertotaxi_phone");
        sessionStorage.removeItem("tel\xE9fono de taxi puerto");
        sessionStorage.removeItem("puertotaxi_storage_type");
        sessionStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
      } else {
        localStorage.removeItem("sesion_pasajero");
        localStorage.removeItem("puertotaxi_phone");
        localStorage.removeItem("tel\xE9fono de taxi puerto");
        localStorage.removeItem("puertotaxi_storage_type");
        localStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
        sessionStorage.setItem("puertotaxi_phone", cleanPhone);
        sessionStorage.setItem("tel\xE9fono de taxi puerto", cleanPhone);
        sessionStorage.setItem("puertotaxi_storage_type", "session");
        sessionStorage.setItem("tipo_de_almacenamiento_puertotaxi", "session");
      }
    } catch (e2) {
    }
    if (window.firebaseDb && window.firebaseOps) {
      const { doc, setDoc } = window.firebaseOps;
      try {
        await setDoc(doc(window.firebaseDb, "registro_pasajeros", String(cleanPhone)), {
          telefono: cleanPhone,
          phone: cleanPhone,
          saveDevice: isSaveDevice,
          updatedAt: Date.now()
        }, { merge: true }).catch(() => {
        });
      } catch (err) {
      }
    }
    const pin = Math.floor(1e3 + Math.random() * 9e3).toString();
    setGeneratedPin(pin);
    try {
      sessionStorage.setItem("puertotaxi_temp_pin", pin);
    } catch (e2) {
    }
    const callbackUrl = `https://puertotaxi.ciudadavatarpuntarenas.com/?telefono=${cleanPhone}&code=${pin}`;
    const waText = encodeURIComponent(
      `\u{1F695} *PUERTO TAXI PUNTARENAS*

Hola, se confirma la validaci\xF3n de su n\xFAmero 

\u{1F4F1} *Tel\xE9fono:* ${cleanPhone}
\u{1F510} *PIN de confirmaci\xF3n:* ${pin}

\u{1F449} Haz clic aqu\xED para solicitar tu viaje:
https://puertotaxi.ciudadavatarpuntarenas.com/?telefono=${cleanPhone}&code=${pin}
Usa el c\xF3digo con precauci\xF3n.`
    );
    const waUrl = `https://api.whatsapp.com/send?phone=50663162626&text=${waText}`;
    setVerificationLink(waUrl);
    setIsVerifying(true);
    setUserConfirmedMsg(null);
    playBeep(980, 0.2);
  };
  const handleConfirmPinManually = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setPassengerFormError("");
    const enteredPin = pinInput.trim();
    const expectedPin = generatedPin || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("puertotaxi_temp_pin") : "");
    if (expectedPin && enteredPin === expectedPin || enteredPin.length === 4 && (!expectedPin || enteredPin === expectedPin)) {
      const cleanPhone = phone ? String(phone).replace(/\D/g, "") : "";
      const isSaveDevice = storageType === "local";
      setIsPhoneVerified(true);
      setIsVerifying(false);
      setUserConfirmedMsg(`\xA1N\xFAmero verificado exitosamente! PIN acreditado.`);
      if (isSaveDevice && cleanPhone) {
        localStorage.setItem("sesion_pasajero", cleanPhone);
        localStorage.setItem("puertotaxi_phone", cleanPhone);
        localStorage.setItem("tel\xE9fono de taxi puerto", cleanPhone);
        localStorage.setItem("puertotaxi_storage_type", "local");
        localStorage.setItem("tipo_de_almacenamiento_puertotaxi", "local");
        sessionStorage.removeItem("puertotaxi_phone");
        sessionStorage.removeItem("tel\xE9fono de taxi puerto");
        sessionStorage.removeItem("puertotaxi_storage_type");
        sessionStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
      } else if (cleanPhone) {
        localStorage.removeItem("sesion_pasajero");
        localStorage.removeItem("puertotaxi_phone");
        localStorage.removeItem("tel\xE9fono de taxi puerto");
        localStorage.removeItem("puertotaxi_storage_type");
        localStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
        sessionStorage.setItem("puertotaxi_phone", cleanPhone);
        sessionStorage.setItem("tel\xE9fono de taxi puerto", cleanPhone);
        sessionStorage.setItem("puertotaxi_storage_type", "session");
        sessionStorage.setItem("tipo_de_almacenamiento_puertotaxi", "session");
      }
      if (window.firebaseDb && window.firebaseOps && cleanPhone) {
        const { doc, setDoc } = window.firebaseOps;
        try {
          await setDoc(doc(window.firebaseDb, "registro_pasajeros", String(cleanPhone)), {
            telefono: cleanPhone,
            phone: cleanPhone,
            saveDevice: isSaveDevice,
            verifiedAt: Date.now()
          }, { merge: true });
        } catch (err) {
        }
      }
      playBeep(1050, 0.25);
    } else {
      setPassengerFormError("El PIN ingresado no coincide. Verifica e intenta de nuevo.");
    }
  };
  const handleCreateRideRequest = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!exactAddress.trim()) {
      setPassengerFormError("Por favor indica tu direcci\xF3n exacta de recogida.");
      return;
    }
    const cleanP = phone ? String(phone).replace(/\D/g, "") : "88888888";
    const last4 = cleanP.slice(-4) || "8888";
    const maskedPhone = cleanP.length >= 4 ? `****${last4}` : cleanP;
    const passengerId = `Pasajero #${last4}`;
    const nowMs = Date.now();
    const reqDocId = "req-" + nowMs;
    const newReq = {
      id: reqDocId,
      firestoreId: reqDocId,
      phone: cleanP,
      maskedPhone,
      passengerPublicId: passengerId,
      passengerId,
      passengerPhoneLast4: last4,
      passengerLast4: last4,
      zone: passengerZone,
      exactAddress: exactAddress.trim(),
      paymentMethod,
      hasPet,
      petOption: hasPet,
      mariaStyle,
      unitType,
      status: "PENDING",
      createdAt: nowMs,
      creadoEn: nowMs
    };
    setRequestCountdown(15);
    setPendingRequest(newReq);
    try {
      localStorage.setItem("puertotaxi_pending_request", JSON.stringify(newReq));
      localStorage.setItem("taxiclick_pending_request", JSON.stringify(newReq));
    } catch (e2) {
    }
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          const bc1 = new BroadcastChannel("taxiclick_broadcast");
          bc1.postMessage({ type: "NEW_REQUEST", payload: newReq, request: newReq });
          bc1.close();
        } catch (e2) {
        }
        try {
          const bc2 = new BroadcastChannel("taxiclick_channel");
          bc2.postMessage({ type: "NEW_REQUEST", payload: newReq, request: newReq });
          bc2.close();
        } catch (e2) {
        }
      }
      try {
        window.dispatchEvent(new CustomEvent("taxiclick-new-request", { detail: newReq }));
      } catch (e2) {
      }
    }
    const saveReqToFirestore = async () => {
      if (!window.firebaseDb || !window.firebaseOps) return;
      const { doc, setDoc, collection, addDoc } = window.firebaseOps;
      try {
        if (doc && setDoc) {
          await setDoc(doc(window.firebaseDb, "solicitudes_viaje", reqDocId), newReq);
        } else if (collection && addDoc) {
          const docRef = await addDoc(collection(window.firebaseDb, "solicitudes_viaje"), newReq);
          newReq.firestoreId = docRef.id;
          setPendingRequest({ ...newReq, firestoreId: docRef.id });
          localStorage.setItem("puertotaxi_pending_request", JSON.stringify({ ...newReq, firestoreId: docRef.id }));
          localStorage.setItem("taxiclick_pending_request", JSON.stringify({ ...newReq, firestoreId: docRef.id }));
        }
      } catch (err) {
      }
    };
    if (window.firebaseDb && window.firebaseOps) {
      await saveReqToFirestore();
    } else {
      window.addEventListener("firebase-initialized", saveReqToFirestore, { once: true });
    }
    playBeep(880, 0.25);
  };
  const handleCancelPendingRequest = () => {
    const req = pendingRequest;
    setPendingRequest(null);
    setRequestCountdown(15);
    try {
      localStorage.removeItem("puertotaxi_pending_request");
      localStorage.removeItem("taxiclick_pending_request");
    } catch (e) {
    }
    const reqId = req ? req.firestoreId || req.id : null;
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          const bc1 = new BroadcastChannel("taxiclick_broadcast");
          bc1.postMessage({ type: "CANCEL_REQUEST", requestId: reqId });
          bc1.close();
        } catch (e) {
        }
        try {
          const bc2 = new BroadcastChannel("taxiclick_channel");
          bc2.postMessage({ type: "CANCEL_REQUEST", requestId: reqId });
          bc2.close();
        } catch (e) {
        }
      }
      try {
        window.dispatchEvent(new CustomEvent("taxiclick-cancel-request"));
      } catch (e) {
      }
    }
    if (window.firebaseDb && window.firebaseOps && reqId) {
      const { doc, updateDoc } = window.firebaseOps;
      updateDoc(doc(window.firebaseDb, "solicitudes_viaje", String(reqId)), {
        status: "CANCELADO_TIEMPO_DESACTIVADO",
        cancelledAt: Date.now()
      }).catch(() => {
      });
    }
  };
  const handleAcceptRequest = async (req) => {
    if (!loggedDriver) return;
    const docId = req.firestoreId || req.id;
    const initialSystemMsg = {
      id: "msg-system-1",
      sender: "SYSTEM",
      senderName: "Central Puerto Taxi",
      text: `Sala Privada Segura Iniciada para la unidad ${loggedDriver && (loggedDriver.placa || loggedDriver.licensePlate) || ""} (${loggedDriver.name || "Taxista"}). Tiempo oficial: 10 minutos.`,
      timestamp: Date.now()
    };
    const trip = {
      id: req.id || docId,
      firestoreId: docId,
      passengerPhone: req.phone,
      passengerPublicId: req.passengerPublicId,
      driverId: loggedDriver.id,
      driverName: loggedDriver.name || "Taxista Oficial",
      driverPlate: loggedDriver && (loggedDriver.placa || loggedDriver.licensePlate) || "",
      driverUnitType: loggedDriver.unitType || "SED\xC1N",
      zone: req.zone,
      exactAddress: req.exactAddress,
      paymentMethod: req.paymentMethod,
      hasPet: req.hasPet,
      mariaStyle: req.mariaStyle,
      unitType: req.unitType,
      startedAt: Date.now(),
      status: "IN_PROGRESS",
      messages: [initialSystemMsg]
    };
    setActiveTrip(trip);
    setChatMessages([initialSystemMsg]);
    setPendingRequest(null);
    try {
      localStorage.setItem("puertotaxi_active_trip", JSON.stringify(trip));
      localStorage.setItem("taxiclick_active_trip", JSON.stringify(trip));
      sessionStorage.setItem("puertotaxi_active_trip", JSON.stringify(trip));
      localStorage.setItem("puertotaxi_chat_" + docId, JSON.stringify([initialSystemMsg]));
      localStorage.removeItem("puertotaxi_pending_request");
      localStorage.removeItem("taxiclick_pending_request");
    } catch (e) {
    }
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          const bc1 = new BroadcastChannel("taxiclick_broadcast");
          bc1.postMessage({ type: "ACCEPT_REQUEST", trip, payload: trip });
          bc1.close();
        } catch (e) {
        }
        try {
          const bc2 = new BroadcastChannel("taxiclick_channel");
          bc2.postMessage({ type: "ACCEPT_REQUEST", trip, payload: trip });
          bc2.close();
        } catch (e) {
        }
      }
      try {
        window.dispatchEvent(new CustomEvent("taxiclick-accept-trip", { detail: trip }));
      } catch (e) {
      }
    }
    const commitAcceptToFirestore = async () => {
      if (!window.firebaseDb || !window.firebaseOps || !docId) return;
      const { doc, setDoc, updateDoc, collection, addDoc } = window.firebaseOps;
      try {
        if (setDoc) {
          await setDoc(doc(window.firebaseDb, "solicitudes_viaje", String(docId)), {
            status: "ACCEPTED",
            driverId: loggedDriver.id,
            driverName: loggedDriver.name || "Taxista Oficial",
            driverPlate: loggedDriver && (loggedDriver.placa || loggedDriver.licensePlate) || "",
            driverUnitType: loggedDriver.unitType || "SED\xC1N",
            tripData: trip,
            acceptedAt: Date.now()
          }, { merge: true });
        } else {
          await updateDoc(doc(window.firebaseDb, "solicitudes_viaje", String(docId)), {
            status: "ACCEPTED",
            driverId: loggedDriver.id,
            driverName: loggedDriver.name || "Taxista Oficial",
            driverPlate: loggedDriver && (loggedDriver.placa || loggedDriver.licensePlate) || "",
            driverUnitType: loggedDriver.unitType || "SED\xC1N",
            tripData: trip,
            acceptedAt: Date.now()
          });
        }
        addDoc(collection(window.firebaseDb, "solicitudes_viaje", String(docId), "mensajes"), initialSystemMsg).catch(() => {
        });
      } catch (e) {
      }
    };
    if (window.firebaseDb && window.firebaseOps) {
      await commitAcceptToFirestore();
    } else {
      window.addEventListener("firebase-initialized", commitAcceptToFirestore, { once: true });
    }
    playBeep(1100, 0.3);
  };
  const handlePassengerCancelActiveTrip = () => {
    if (!activeTrip || role !== "PASSENGER" || tripElapsedSec > 60) return;
    const tripToCancel = activeTrip;
    const tripDocId = tripToCancel.firestoreId || tripToCancel.id;
    const notifyCancelInFirestore = async () => {
      if (!window.firebaseDb || !window.firebaseOps) return;
      const { doc, updateDoc, collection, getDocs, query, where } = window.firebaseOps;
      try {
        if (tripDocId) {
          await updateDoc(doc(window.firebaseDb, "solicitudes_viaje", String(tripDocId)), {
            status: "CANCELLED_BY_PASSENGER",
            cancelledAt: Date.now()
          }).catch(() => {
          });
        }
        if (tripToCancel.id && query && where && getDocs) {
          const q = query(collection(window.firebaseDb, "solicitudes_viaje"), where("id", "==", tripToCancel.id));
          const snap = await getDocs(q).catch(() => null);
          if (snap && !snap.empty) {
            snap.forEach((dSnap) => {
              updateDoc(doc(window.firebaseDb, "solicitudes_viaje", dSnap.id), {
                status: "CANCELLED_BY_PASSENGER",
                cancelledAt: Date.now()
              }).catch(() => {
              });
            });
          }
        }
      } catch (e) {
      }
    };
    if (window.firebaseDb && window.firebaseOps) {
      notifyCancelInFirestore();
    } else {
      window.addEventListener("firebase-initialized", notifyCancelInFirestore, { once: true });
    }
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          const bc1 = new BroadcastChannel("taxiclick_broadcast");
          bc1.postMessage({ type: "CANCEL_TRIP", tripId: tripDocId });
          bc1.close();
        } catch (e) {
        }
        try {
          const bc2 = new BroadcastChannel("taxiclick_channel");
          bc2.postMessage({ type: "CANCEL_TRIP", tripId: tripDocId });
          bc2.close();
        } catch (e) {
        }
      }
      try {
        localStorage.setItem("puertotaxi_cancelled_trip", JSON.stringify({ tripId: tripDocId, cancelledAt: Date.now() }));
      } catch (e) {
      }
    }
    setActiveTrip(null);
    setChatMessages([]);
    try {
      localStorage.removeItem("puertotaxi_active_trip");
      localStorage.removeItem("taxiclick_active_trip");
      sessionStorage.removeItem("puertotaxi_active_trip");
      if (tripDocId) localStorage.removeItem("puertotaxi_chat_" + tripDocId);
    } catch (e) {
    }
    setIsPhoneVerified(true);
    setRole("PASSENGER");
    playBeep(700, 0.4);
  };
  const handleDriverCompleteActiveTrip = () => {
    if (!activeTrip) return;
    const tripDocId = activeTrip.firestoreId || activeTrip.id;
    if (window.firebaseDb && window.firebaseOps && tripDocId) {
      const { doc, updateDoc } = window.firebaseOps;
      updateDoc(doc(window.firebaseDb, "solicitudes_viaje", String(tripDocId)), {
        status: "COMPLETED",
        completedAt: Date.now()
      }).catch(() => {
      });
    }
    handleCompleteOrEndTrip();
  };
  const manejarCompletarOFinalizarViaje = () => {
    const currentTrip = activeTripRef.current || activeTrip;
    const tripDocId = currentTrip ? currentTrip.firestoreId || currentTrip.id : null;
    setActiveTrip(null);
    setChatMessages([]);
    try {
      localStorage.removeItem("puertotaxi_active_trip");
      localStorage.removeItem("taxiclick_active_trip");
      sessionStorage.removeItem("puertotaxi_active_trip");
      if (tripDocId) localStorage.removeItem("puertotaxi_chat_" + tripDocId);
    } catch (e) {
    }
    playBeep(700, 0.4);
    const isExplicitTemporary = (storageType === "session" || storageType === "sesion" || sessionStorage.getItem("puertotaxi_storage_type") === "session" || sessionStorage.getItem("puertotaxi_storage_type") === "sesion" || sessionStorage.getItem("tipo_de_almacenamiento_puertotaxi") === "session" || sessionStorage.getItem("tipo_de_almacenamiento_puertotaxi") === "sesion") && !localStorage.getItem("sesion_pasajero");
    if (roleRef.current === "PASSENGER" && isExplicitTemporary) {
      try {
        localStorage.removeItem("sesion_pasajero");
        localStorage.removeItem("puertotaxi_phone");
        localStorage.removeItem("tel\xE9fono de taxi puerto");
        localStorage.removeItem("telefono_de_taxi_puerto");
        localStorage.removeItem("puertotaxi_storage_type");
        localStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
        localStorage.removeItem("puertotaxi_temp_pin");
        localStorage.removeItem("PIN temporal");
        localStorage.removeItem("pin_temporal");
        sessionStorage.removeItem("sesion_pasajero");
        sessionStorage.removeItem("puertotaxi_phone");
        sessionStorage.removeItem("tel\xE9fono de taxi puerto");
        sessionStorage.removeItem("telefono_de_taxi_puerto");
        sessionStorage.removeItem("puertotaxi_storage_type");
        sessionStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
        sessionStorage.removeItem("puertotaxi_temp_pin");
        sessionStorage.removeItem("PIN temporal");
        sessionStorage.removeItem("pin_temporal");
      } catch (e) {
      }
      setIsPhoneVerified(false);
      setIsVerifying(false);
      setPhone("");
      setVerificationLink("");
      setPinInput("");
      setGeneratedPin("");
      setProdhabAccepted(false);
      setStorageType("session");
      setUserConfirmedMsg("Viaje finalizado. Al haber seleccionado la opci\xF3n temporal, tus datos locales han sido borrados de inmediato y debes validar tu tel\xE9fono para un nuevo servicio.");
    }
  };
  const handleCompleteOrEndTrip = manejarCompletarOFinalizarViaje;
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeTrip) return;
    const tripDocId = activeTrip.firestoreId || activeTrip.id;
    const newMsg = {
      id: "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1e3),
      sender: role === "DRIVER" ? "DRIVER" : "PASSENGER",
      senderName: role === "DRIVER" ? loggedDriver && loggedDriver.name ? loggedDriver.name : "Taxista" : publicPassengerId,
      text: chatInput.trim(),
      timestamp: Date.now()
    };
    setChatMessages((prev) => {
      const next = [...prev, newMsg].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      try {
        if (tripDocId) {
          localStorage.setItem("puertotaxi_chat_" + tripDocId, JSON.stringify(next));
        }
      } catch (err) {
      }
      return next;
    });
    setChatInput("");
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          const bc1 = new BroadcastChannel("taxiclick_broadcast");
          bc1.postMessage({ type: "CHAT_MESSAGE", tripId: tripDocId, message: newMsg });
          bc1.close();
        } catch (err) {
        }
        try {
          const bc2 = new BroadcastChannel("taxiclick_channel");
          bc2.postMessage({ type: "CHAT_MESSAGE", tripId: tripDocId, message: newMsg });
          bc2.close();
        } catch (err) {
        }
      }
      try {
        localStorage.setItem("puertotaxi_last_chat_msg", JSON.stringify({ tripId: tripDocId, message: newMsg }));
      } catch (err) {
      }
    }
    const pushMsgToFirestore = () => {
      if (!window.firebaseDb || !window.firebaseOps || !tripDocId) return;
      const { collection, addDoc } = window.firebaseOps;
      addDoc(collection(window.firebaseDb, "solicitudes_viaje", String(tripDocId), "mensajes"), newMsg).catch(() => {
      });
    };
    if (window.firebaseDb && window.firebaseOps) {
      pushMsgToFirestore();
    } else {
      window.addEventListener("firebase-initialized", pushMsgToFirestore, { once: true });
    }
  };
  const handleToggleRecording = async () => {
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
        }
      }
      setIsRecordingAudio(false);
      if (timerAudioRef.current) clearInterval(timerAudioRef.current);
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Tu navegador o dispositivo no tiene soporte para grabaci\xF3n de micr\xF3fono o requiere conexi\xF3n segura (HTTPS).");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        const recordStartMs = Date.now();
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const computedDuration = Math.max(1, Math.round((Date.now() - recordStartMs) / 1e3));
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Audio = reader.result;
            const tripDocId = activeTrip ? activeTrip.firestoreId || activeTrip.id : null;
            const newAudioMsg = {
              id: "audio-" + Date.now() + "-" + Math.floor(Math.random() * 1e3),
              sender: role === "DRIVER" ? "DRIVER" : "PASSENGER",
              senderName: role === "DRIVER" ? loggedDriver && loggedDriver.name ? loggedDriver.name : "Taxista" : publicPassengerId || "Pasajero",
              audioData: base64Audio,
              duration: computedDuration,
              timestamp: Date.now()
            };
            setChatMessages((prev) => {
              const next = [...prev, newAudioMsg].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              try {
                if (tripDocId) {
                  localStorage.setItem("puertotaxi_chat_" + tripDocId, JSON.stringify(next));
                }
              } catch (err) {
              }
              return next;
            });
            if (typeof window !== "undefined") {
              if ("BroadcastChannel" in window) {
                try {
                  const bc1 = new BroadcastChannel("taxiclick_broadcast");
                  bc1.postMessage({ type: "CHAT_MESSAGE", tripId: tripDocId, message: newAudioMsg });
                  bc1.close();
                } catch (err) {
                }
                try {
                  const bc2 = new BroadcastChannel("taxiclick_channel");
                  bc2.postMessage({ type: "CHAT_MESSAGE", tripId: tripDocId, message: newAudioMsg });
                  bc2.close();
                } catch (err) {
                }
              }
              try {
                localStorage.setItem("puertotaxi_last_chat_msg", JSON.stringify({ tripId: tripDocId, message: newAudioMsg }));
              } catch (err) {
              }
            }
            const pushAudioToFirestore = () => {
              if (!window.firebaseDb || !window.firebaseOps || !tripDocId) return;
              const { collection, addDoc } = window.firebaseOps;
              addDoc(collection(window.firebaseDb, "solicitudes_viaje", String(tripDocId), "mensajes"), newAudioMsg).catch(() => {
              });
            };
            if (window.firebaseDb && window.firebaseOps) {
              pushAudioToFirestore();
            } else {
              window.addEventListener("firebase-initialized", pushAudioToFirestore, { once: true });
            }
            playBeep(850, 0.15);
            setRecordSeconds(0);
          };
          stream.getTracks().forEach((track) => track.stop());
        };
        recorder.start();
        setIsRecordingAudio(true);
        setRecordSeconds(0);
        timerAudioRef.current = setInterval(() => {
          setRecordSeconds((s) => s + 1);
        }, 1e3);
      } catch (err) {
        console.error("Error de acceso al micr\xF3fono:", err);
        alert("Se requiere permiso para usar el micr\xF3fono para grabar y enviar notas de voz. Por favor autoriza el acceso al micr\xF3fono en tu navegador.");
        setIsRecordingAudio(false);
      }
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950" }, /* @__PURE__ */ React.createElement("header", { className: "bg-slate-900 border-b border-amber-400/30 sticky top-0 z-40 px-4 py-3 shadow-lg" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-md mx-auto flex items-center justify-between" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: handleEscapeToPassengers,
      className: "flex items-center gap-2.5 cursor-pointer select-none"
    },
    /* @__PURE__ */ React.createElement("span", { className: "text-2xl drop-shadow" }, "\u{1F695}"),
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-base font-black tracking-tight text-amber-400 block leading-none" }, "Puerto Taxi"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-bold uppercase tracking-wider" }, "Puntarenas"))
  ))), emergencyAlert && (role === "DRIVER" || role === "ADMIN_CENTRAL") && /* @__PURE__ */ React.createElement("div", { className: "bg-red-600 text-white px-4 py-3 text-center text-xs font-black uppercase tracking-wider animate-bounce sticky top-[57px] z-50 shadow-2xl flex flex-col sm:flex-row items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F6A8}"), /* @__PURE__ */ React.createElement("span", null, "ALERTA 10-33: Chofer ", emergencyAlert.driverName, " (", emergencyAlert.licensePlate || emergencyAlert.placa || "", ") en GPS (", emergencyAlert.lat, ", ", emergencyAlert.lng, ")")), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: emergencyAlert.googleMapsUrl || `https://www.google.com/maps?q=${emergencyAlert.lat},${emergencyAlert.lng}`,
      target: "_blank",
      rel: "noopener noreferrer",
      className: "px-3 py-1 bg-white text-red-700 font-black rounded-lg text-[11px] hover:bg-slate-100 transition-all shadow underline"
    },
    "\u{1F4CD} Ver Ubicaci\xF3n en Google Maps (",
    emergencyAlert.lat,
    ", ",
    emergencyAlert.lng,
    ")"
  )), /* @__PURE__ */ React.createElement("main", { className: "flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-start" }, role === null ? (
    /* 1. INTERFAZ DE INICIO: ELIJA USUARIO */
    /* @__PURE__ */ React.createElement("div", { className: "my-auto py-8 text-center space-y-6 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 mx-auto bg-amber-400/10 border-2 border-amber-400/50 rounded-2xl flex items-center justify-center text-3xl shadow-lg" }, "\u{1F695}"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-black uppercase text-amber-400 tracking-widest block" }, "PUERTO TAXI PUNTARENAS"), /* @__PURE__ */ React.createElement("h1", { className: "text-3xl font-black text-white tracking-tight" }, "Elija Usuario"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 max-w-xs mx-auto" }, "Selecciona tu perfil")), /* @__PURE__ */ React.createElement("div", { className: "w-full space-y-3.5 pt-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setRole("PASSENGER"),
        className: "w-full py-4 px-6 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-base uppercase rounded-2xl shadow-xl shadow-orange-600/20 border-2 border-orange-400 transition-all flex items-center justify-center gap-3 cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("span", { className: "text-2xl" }, "\u{1F464}"),
      /* @__PURE__ */ React.createElement("span", null, "Pasajero")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setRole("DRIVER"),
        className: "w-full py-4 px-6 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-black text-base uppercase rounded-2xl shadow-xl shadow-amber-400/20 border-2 border-amber-300 transition-all flex items-center justify-center gap-3 cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("span", { className: "text-2xl" }, "\u{1F695}"),
      /* @__PURE__ */ React.createElement("span", null, "Taxista")
    )), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-slate-400 pt-2" }, "By Ciudad Avatar Puntarenas Copyright Todos los derechos reservados 2026."))
  ) : activeTrip ? (
    /* 2. SALA PRIVADA DE VIAJE (ACTIVA TRAS ACEPTACIÓN) */
    /* @__PURE__ */ React.createElement("div", { className: "space-y-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 border-2 border-amber-400 p-4 rounded-3xl shadow-2xl relative overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-start mb-3 border-b border-slate-800 pb-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "px-2.5 py-0.5 bg-amber-400/20 text-amber-400 font-black text-[10px] rounded-full uppercase tracking-wider border border-amber-400/30" }, role === "DRIVER" ? "Pasajero a Bordo" : "Taxista Asignado"), /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-black text-white mt-1" }, role === "DRIVER" ? activeTrip.passengerPublicId || `Pasajero #${String(activeTrip.passengerPhone || "****").slice(-4)}` : activeTrip.driverName), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 font-bold" }, role === "DRIVER" ? `ID Privado: #${String(activeTrip.passengerPhoneLast4 || activeTrip.passengerPhone || "****").slice(-4)}` : `Placa Oficial: ${activeTrip.driverPlate}`)), /* @__PURE__ */ React.createElement("div", { className: "text-right" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-slate-400 uppercase" }, "Tiempo de Carrera"), /* @__PURE__ */ React.createElement("div", { className: "text-xl font-black text-amber-400 font-mono tracking-tight" }, formatTime(tripElapsedSec)), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-slate-500" }, "M\xE1x 10:00 min"))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/90 border border-slate-800 p-3 rounded-2xl mb-3 space-y-1 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-400 font-bold text-[10px] uppercase" }, "Ruta Oficial Puntarenas:"), /* @__PURE__ */ React.createElement("div", { className: "font-extrabold text-amber-300" }, activeTrip.zone), /* @__PURE__ */ React.createElement("div", { className: "text-slate-300 font-medium break-words" }, activeTrip.exactAddress)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between text-[11px] bg-slate-900 px-3 py-2 rounded-xl text-slate-300 font-bold mb-3 border border-slate-800" }, /* @__PURE__ */ React.createElement("span", null, "Pago: ", /* @__PURE__ */ React.createElement("strong", { className: "text-amber-400" }, activeTrip.paymentMethod)), /* @__PURE__ */ React.createElement("span", null, "Mascota: ", activeTrip.hasPet ? "\u{1F43E} S\xCD" : "NO"), /* @__PURE__ */ React.createElement("span", null, activeTrip.unitType)), /* @__PURE__ */ React.createElement("div", { className: "pt-2" }, role === "PASSENGER" && tripElapsedSec <= 60 && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handlePassengerCancelActiveTrip,
        className: "w-full py-2.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
      },
      "Cancelar Carrera (Dentro de los primeros 60s)"
    ), role === "PASSENGER" && tripElapsedSec > 60 && /* @__PURE__ */ React.createElement("div", { className: "text-center text-[10px] text-slate-500 font-bold py-1" }, "Per\xEDodo de cancelaci\xF3n expirado (l\xEDmite 60s). Viaje en curso."), role === "DRIVER" && /* @__PURE__ */ React.createElement("div", { className: "text-center text-[10px] text-slate-400 font-bold py-1" }, "Viaje en curso \u2022 Sala privada activa"))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col h-[320px]" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider pb-2 border-b border-slate-800 flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Sala de Chat y Audio Privada"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 font-normal uppercase text-[9px]" }, "MENSAJES SER\xC1N ELIMINADOS A LOS 10MIN")), /* @__PURE__ */ React.createElement("div", { ref: chatScrollRef, className: "flex-1 overflow-y-auto py-3 space-y-2.5 text-xs pr-1" }, chatMessages.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "text-center text-slate-500 my-auto text-[11px] py-8" }, "Canal seguro abierto. Env\xEDa un mensaje o nota de voz al taxista/pasajero.") : chatMessages.map((m) => {
      const isMe = role === "DRIVER" && m.sender === "DRIVER" || role === "PASSENGER" && m.sender === "PASSENGER";
      const isSys = m.sender === "SYSTEM";
      if (isSys) {
        return /* @__PURE__ */ React.createElement("div", { key: m.id, className: "text-center my-1" }, /* @__PURE__ */ React.createElement("span", { className: "bg-slate-950 text-slate-400 text-[10px] px-3 py-1 rounded-full border border-slate-800 inline-block font-medium" }, m.text));
      }
      return /* @__PURE__ */ React.createElement("div", { key: m.id, className: `flex flex-col ${isMe ? "items-end" : "items-start"}` }, /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-slate-400 px-1 mb-0.5" }, m.senderName), /* @__PURE__ */ React.createElement("div", { className: `p-2.5 rounded-2xl max-w-[85%] break-words ${isMe ? "bg-amber-400 text-slate-950 font-bold rounded-tr-none" : "bg-slate-800 text-white rounded-tl-none border border-slate-700 font-medium"}` }, m.audioData ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F3A4} Audio (", m.duration || 1, "s)"), /* @__PURE__ */ React.createElement("audio", { controls: true, src: m.audioData, className: "h-6 w-36 max-w-full" })) : /* @__PURE__ */ React.createElement("span", null, m.text)));
    })), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSendChatMessage, className: "pt-2 border-t border-slate-800 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleToggleRecording,
        className: `p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${isRecordingAudio ? "bg-red-600 text-white animate-pulse" : "bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700"}`,
        title: "Grabar Nota de Voz"
      },
      isRecordingAudio ? `Grabando (${recordSeconds}s)` : "\u{1F3A4}"
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: chatInput,
        onChange: (e) => setChatInput(e.target.value),
        placeholder: "Escribe un mensaje seguro...",
        className: "flex-1 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-medium"
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        disabled: !chatInput.trim(),
        className: "px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs uppercase rounded-xl transition-all cursor-pointer"
      },
      "Enviar"
    ))), role === "DRIVER" && tripElapsedSec < 600 && /* @__PURE__ */ React.createElement("div", { className: "pt-1" }, emergencyGpsError && /* @__PURE__ */ React.createElement("div", { className: "mb-2 p-3 bg-red-950/90 border-2 border-red-500 rounded-2xl text-center space-y-1 shadow-lg animate-pulse" }, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] font-black text-red-300 uppercase tracking-wider" }, "\u26A0\uFE0F ERROR DE SENSOR GPS POR HARDWARE"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-200 font-bold" }, emergencyGpsError)), emergencyAlert && emergencyAlert.alerta_activa ? /* @__PURE__ */ React.createElement("div", { className: "p-3.5 bg-red-950/80 border-2 border-red-500 rounded-2xl text-center space-y-1.5 shadow-2xl" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-black text-red-300 animate-pulse uppercase tracking-wider flex items-center justify-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F6A8}"), /* @__PURE__ */ React.createElement("span", null, "PROTOCOLO 10-33 ACTIVO Y PERSISTENTE")), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-300 leading-relaxed" }, "Se\xF1al silenciosa de emergencia transmiti\xE9ndose en vivo a la Central.")) : /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleTriggerSilentEmergency,
        className: "w-full py-3.5 bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-black text-xs sm:text-sm uppercase rounded-2xl border-2 border-red-400 shadow-xl shadow-red-600/20 cursor-pointer flex items-center justify-center gap-2 transition-all"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F6A8}"),
      /* @__PURE__ */ React.createElement("span", null, "EMERGENCIA SILENCIOSA 10-33")
    )))
  ) : role === "ADMIN_CENTRAL" || isAdmin ? (
    /* 3. PANEL DE CONTROL MAESTRO DE LA CENTRAL DE RADIO */
    /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 text-slate-100 rounded-3xl p-6 border-2 border-amber-400 shadow-2xl space-y-5 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center border-b border-slate-800 pb-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider" }, "Perfil Autorizado"), /* @__PURE__ */ React.createElement("h2", { className: "text-base font-black" }, "Panel de Control Maestro"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Central de Radio \u2022 Ciudad Avatar Puntarenas")), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleLogoutDriver,
        className: "text-xs font-bold text-red-400 hover:underline cursor-pointer"
      },
      "Cerrar Sesi\xF3n"
    )), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-300" }, "Switch Maestro Alerta 10-33:"), /* @__PURE__ */ React.createElement("span", { className: emergencyAlert ? "text-red-400 font-black animate-pulse" : "text-emerald-400 font-bold" }, emergencyAlert ? "\u{1F6A8} ALERTA ACTIVA" : "\u2705 SISTEMA DESPEJADO")), emergencyAlert ? /* @__PURE__ */ React.createElement("div", { className: "space-y-2.5 bg-red-950/40 p-3 rounded-xl border border-red-500/50 text-xs" }, /* @__PURE__ */ React.createElement("div", null, "Chofer: ", /* @__PURE__ */ React.createElement("strong", null, emergencyAlert.driverName)), /* @__PURE__ */ React.createElement("div", null, "Placa: ", /* @__PURE__ */ React.createElement("strong", { className: "font-mono text-amber-400" }, emergencyAlert.licensePlate)), /* @__PURE__ */ React.createElement("div", null, "Zona: ", /* @__PURE__ */ React.createElement("strong", null, emergencyAlert.zone)), /* @__PURE__ */ React.createElement("div", null, "GPS: ", emergencyAlert.lat, ", ", emergencyAlert.lng), emergencyAlert.googleMapsUrl && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
      "a",
      {
        href: emergencyAlert.googleMapsUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-slate-950 font-black rounded-lg text-xs hover:bg-amber-300 transition-all shadow"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F4CD}"),
      /* @__PURE__ */ React.createElement("span", null, "Abrir Ubicaci\xF3n en Google Maps")
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleDeactivateEmergencyCentral,
        className: "w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase cursor-pointer"
      },
      "[Central: Apagar Alerta 10-33]"
    )) : /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "No hay emergencias activas en este momento. La se\xF1al silenciosa de p\xE1nico de los choferes se apaga exclusivamente desde este panel maestro.")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-black uppercase text-amber-400 tracking-wider" }, "Flota Registrada (", drivers.length, " Unidades)"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2 text-xs max-h-48 overflow-y-auto" }, drivers.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 text-center py-4" }, "No hay unidades de taxistas registradas en Firestore actualmente.") : drivers.map((d) => /* @__PURE__ */ React.createElement("div", { key: d.id, className: "p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "font-bold text-white" }, d.name || d.email), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, d.licensePlate || "TX", " \u2022 ", d.unitType || "SED\xC1N")), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold ${d.status === "DISPONIBLE" ? "text-emerald-400" : "text-slate-500"}` }, d.status || "INACTIVO"))))))
  ) : role === "PASSENGER" ? (
    /* 4. MÓDULO DE PASAJEROS */
    /* @__PURE__ */ React.createElement("div", { className: "space-y-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-800 pb-2 flex justify-between items-center" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-orange-400 tracking-wider" }, "M\xF3dulo Pasajeros Puntarenas"), /* @__PURE__ */ React.createElement("h1", { className: "text-xl font-black text-white" }, "Pedir Taxi en Puntarenas")), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleEscapeToPassengers,
        className: "text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer"
      },
      "\u2190 Volver"
    )), userConfirmedMsg && /* @__PURE__ */ React.createElement("div", { className: "bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 p-3 rounded-2xl text-xs font-bold text-center" }, userConfirmedMsg), isPhoneVerified ? /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateRideRequest, className: "bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center pb-2 border-b border-slate-800" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-slate-300" }, "ID P\xFAblico: ", /* @__PURE__ */ React.createElement("strong", { className: "text-amber-400 font-mono" }, "Pasajero #", phone ? phone.replace(/\D/g, "").slice(-4) || "8888" : "8888")), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          setIsPhoneVerified(false);
          setIsVerifying(false);
          try {
            localStorage.removeItem("sesion_pasajero");
            localStorage.removeItem("puertotaxi_phone");
            sessionStorage.removeItem("puertotaxi_phone");
          } catch (e) {
          }
        },
        className: "text-[11px] text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
      },
      "Cambiar n\xFAmero"
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-black uppercase text-amber-400 mb-1" }, "Zona (12 Zonas):"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: passengerZone,
        onChange: (e) => setPassengerZone(e.target.value),
        className: "w-full p-3 bg-slate-900 border border-slate-800 rounded-2xl font-bold text-xs text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
      },
      PUNTARENAS_ZONES.map((z) => /* @__PURE__ */ React.createElement("option", { key: z, value: z }, z))
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-black uppercase text-amber-400" }, "Direcci\xF3n Exacta:"), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-mono font-bold ${exactAddress.length >= 100 ? "text-red-400" : "text-slate-400"}` }, exactAddress.length, "/100")), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        maxLength: 100,
        value: exactAddress,
        onChange: (e) => setExactAddress(e.target.value.slice(0, 100)),
        placeholder: "Ej: Primera de San Luis 100 norte, 200 oeste y 100 norte",
        className: "w-full p-3 bg-slate-900 border border-slate-800 rounded-2xl font-medium text-xs text-slate-100 focus:outline-none focus:border-amber-400",
        required: true
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-black uppercase text-slate-300 mb-1" }, "M\xE9todo de Pago:"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-1.5" }, ["SINPE", "EFECTIVO", "CUALQUIERA"].map((m) => /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        key: m,
        onClick: () => setPaymentMethod(m),
        className: `py-2 text-[11px] font-black rounded-xl border transition-all cursor-pointer ${paymentMethod === m ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      m === "SINPE" ? "\u26A1 SINPE" : m === "EFECTIVO" ? "\u{1F4B5} Efectivo" : "\u{1F504} CUALQUIERA"
    )))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-black uppercase text-slate-300 mb-1" }, "Mascota (Pet Friendly):"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setHasPet(true),
        className: `py-2 text-[11px] font-black rounded-xl border transition-all cursor-pointer ${hasPet === true ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F43E} S\xCD (Pet Friendly)"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setHasPet(false),
        className: `py-2 text-[11px] font-black rounded-xl border transition-all cursor-pointer ${hasPet === false ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F6AB} NO"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setHasPet("CUALQUIERA"),
        className: `py-2 text-[11px] font-black rounded-xl border transition-all cursor-pointer ${hasPet === "CUALQUIERA" ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F504} CUALQUIERA"
    ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-black uppercase text-slate-300 mb-1" }, "Estilo de Mar\xEDa (Tax\xEDmetro):"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setMariaStyle("TIQUETE Y FECHA AL D\xCDA"),
        className: `py-2 px-1 text-[10px] font-black rounded-xl border transition-all cursor-pointer ${mariaStyle === "TIQUETE Y FECHA AL D\xCDA" ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F4DC} Con T\xEDquete al d\xEDa"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setMariaStyle("SIN TIQUETE"),
        className: `py-2 px-1 text-[10px] font-black rounded-xl border transition-all cursor-pointer ${mariaStyle === "SIN TIQUETE" ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F3F7}\uFE0F Sin T\xEDquete"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setMariaStyle("Cualquiera"),
        className: `py-2 px-1 text-[10px] font-black rounded-xl border transition-all cursor-pointer ${mariaStyle === "Cualquiera" || mariaStyle === "CUALQUIERA" ? "bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/20" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      "\u{1F50D} Cualquiera"
    ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-black uppercase text-slate-300 mb-1" }, "Tipo de Unidad:"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-5 gap-1 text-[9px]" }, ["CUALQUIERA", "SED\xC1N", "RURAL", "DISCAPACIDAD", "Van (6 pasajeros)"].map((u) => /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        key: u,
        onClick: () => setUnitType(u),
        className: `py-2 font-black rounded-xl border transition-all cursor-pointer ${unitType === u ? "bg-orange-600 text-white border-orange-500 shadow-sm" : "bg-slate-900 text-slate-300 border-slate-700"}`
      },
      u
    )))), /* @__PURE__ */ React.createElement("div", { className: "bg-amber-400/10 p-3 rounded-2xl border border-amber-400/30 text-center text-xs text-slate-200 font-bold" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-amber-400 uppercase tracking-wide block" }, "Unidades disponibles:"), /* @__PURE__ */ React.createElement("div", { className: "text-2xl font-black text-amber-400 mt-0.5" }, availableFilteredDriversCount)), pendingRequest ? /* @__PURE__ */ React.createElement("div", { className: "space-y-2.5 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "w-full py-3.5 px-4 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white rounded-2xl shadow-xl shadow-orange-600/30 border-2 border-orange-400 text-center space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-2 text-sm font-black animate-pulse" }, /* @__PURE__ */ React.createElement("span", null, "\u23F3"), /* @__PURE__ */ React.createElement("span", null, "BUSCANDO TAXI... ", requestCountdown, "s")), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-orange-100 font-bold" }, "Transmitiendo solicitud en ", pendingRequest.zone, " (", requestCountdown, "s de 15s)")), /* @__PURE__ */ React.createElement("div", { className: "w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "bg-gradient-to-r from-orange-500 to-amber-400 h-2.5 rounded-full transition-all duration-200 ease-linear",
        style: { width: `${Math.max(0, Math.min(100, requestCountdown / 15 * 100))}%` }
      }
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleCancelPendingRequest,
        className: "w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs border border-slate-800 transition-colors cursor-pointer"
      },
      "\u2715 Cancelar y liberar bot\xF3n"
    )) : /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "w-full py-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-orange-600/30 border-2 border-orange-400 transition-all cursor-pointer"
      },
      "SOLICITAR TAXI AHORA"
    )) : (
      /* Formulario de Validación de Teléfono (Flujo Forzoso Obligatorio) */
      /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "text-center pb-1" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-black text-white" }, "Validar Tel\xE9fono de Contacto")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleStartPassengerVerification, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-black uppercase text-amber-400 mb-1" }, "N\xFAmero de Tel\xE9fono:"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "tel",
          value: phone,
          onChange: (e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8)),
          placeholder: "8888-8888",
          className: "w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 font-bold focus:outline-none focus:border-amber-400 text-xs tracking-wider font-mono",
          required: true
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-300" }, "\xBFDesea permitir que se guarde su n\xFAmero para no iniciar de nuevo?"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            setStorageType("local");
            try {
              localStorage.setItem("puertotaxi_storage_type", "local");
              localStorage.setItem("tipo_de_almacenamiento_puertotaxi", "local");
              sessionStorage.removeItem("puertotaxi_storage_type");
              sessionStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
            } catch (e) {
            }
          },
          className: `py-2 text-xs font-black rounded-xl border ${storageType === "local" ? "bg-amber-400 text-slate-950 border-amber-300" : "bg-slate-900 text-slate-400 border-slate-700"}`
        },
        "S\xCD (Guardar)"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            setStorageType("session");
            try {
              sessionStorage.setItem("puertotaxi_storage_type", "session");
              sessionStorage.setItem("tipo_de_almacenamiento_puertotaxi", "session");
              localStorage.removeItem("sesion_pasajero");
              localStorage.removeItem("puertotaxi_storage_type");
              localStorage.removeItem("tipo_de_almacenamiento_puertotaxi");
            } catch (e) {
            }
          },
          className: `py-2 text-xs font-black rounded-xl border ${storageType === "session" || storageType === "sesion" ? "bg-amber-400 text-slate-950 border-amber-300" : "bg-slate-900 text-slate-400 border-slate-700"}`
        },
        "NO (Borrar al cerrar)"
      ))), /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          id: "prodhab",
          checked: prodhabAccepted,
          onChange: (e) => setProdhabAccepted(e.target.checked),
          className: "mt-0.5 w-4 h-4 rounded text-orange-600 focus:ring-orange-500 bg-slate-800 border-slate-700"
        }
      ), /* @__PURE__ */ React.createElement("label", { htmlFor: "prodhab", className: "text-[10px] text-slate-400 leading-tight select-none" }, "He le\xEDdo y acepto los ", /* @__PURE__ */ React.createElement("strong", null, "T\xE9rminos y la Pol\xEDtica de Privacidad"), " bajo la ", /* @__PURE__ */ React.createElement("strong", null, "Ley PRODHAB N.\xB0 8968"), " y ", /* @__PURE__ */ React.createElement("strong", null, "Ciudad Avatar Puntarenas"), ".")), passengerFormError && /* @__PURE__ */ React.createElement("div", { className: "bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded-xl text-xs text-center font-bold" }, passengerFormError), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          disabled: !prodhabAccepted || phone.replace(/\D/g, "").length < 8,
          className: "w-full py-3.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl transition-all cursor-pointer"
        },
        "Continuar para verificar servicio"
      )), isVerifying && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900 border-2 border-emerald-500/40 p-4 rounded-2xl space-y-3 mt-4" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-emerald-400 block tracking-wider text-center" }, "Se ha generado tu enlace de validaci\xF3n oficial"), /* @__PURE__ */ React.createElement(
        "a",
        {
          href: verificationLink || `https://api.whatsapp.com/send?phone=50663162626&text=${encodeURIComponent(`\u{1F695} *PUERTO TAXI PUNTARENAS*

Hola, se confirma la validaci\xF3n de su n\xFAmero 

\u{1F4F1} *Tel\xE9fono:* ${phone.replace(/\D/g, "")}
\u{1F510} *PIN de confirmaci\xF3n:* ${generatedPin || pinInput}

\u{1F449} Haz clic aqu\xED para solicitar tu viaje:
https://puertotaxi.ciudadavatarpuntarenas.com/?telefono=${phone.replace(/\D/g, "")}&code=${generatedPin || pinInput}
Usa el c\xF3digo con precauci\xF3n.`)}`,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "block w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase rounded-xl text-center shadow-md transition-all"
        },
        "Abrir Validaci\xF3n en WhatsApp"
      ), /* @__PURE__ */ React.createElement("form", { onSubmit: handleConfirmPinManually, className: "space-y-2 pt-2 border-t border-slate-800" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-300 text-center" }, "O ingresa tu PIN de 4 d\xEDgitos manualmente:"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          maxLength: 4,
          value: pinInput,
          onChange: (e) => setPinInput(e.target.value.replace(/\D/g, "")),
          placeholder: "PIN de 4 d\xEDgitos",
          className: "w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono font-black text-lg text-amber-400"
        }
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          className: "w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase rounded-xl cursor-pointer"
        },
        "Confirmar PIN"
      ))))
    ))
  ) : !driverAuthenticated ? (
    /* 5. PANEL DEL TAXISTA: LOGIN ESTRICTO CON FIRESTORE 10.12.0 & GPS ASÍNCRONO */
    /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 text-white rounded-3xl p-6 border-2 border-amber-400 shadow-2xl space-y-5 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "text-center space-y-1 pb-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider" }, "Flota de Choferes"), /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-black" }, "Acceso a Turno")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleLoginDriver, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-black uppercase text-amber-400 mb-1" }, "Correo Electr\xF3nico:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        value: loginEmail,
        onChange: (e) => setLoginEmail(e.target.value),
        placeholder: "chofer@puertotaxi.cr",
        className: "w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 font-bold focus:outline-none focus:border-amber-400 text-xs",
        required: true
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-black uppercase text-amber-400 mb-1" }, "Contrase\xF1a:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "password",
        value: loginPassword,
        onChange: (e) => setLoginPassword(e.target.value),
        placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
        className: "w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 font-bold focus:outline-none focus:border-amber-400 text-xs",
        required: true
      }
    )), loginError && /* @__PURE__ */ React.createElement("div", { className: "p-3 bg-red-950/80 border border-red-500/50 text-red-300 text-xs rounded-2xl font-bold text-center" }, loginError), isWaitingGps && /* @__PURE__ */ React.createElement("div", { className: "p-3 bg-amber-400/10 border border-amber-400/40 text-amber-300 text-xs rounded-2xl font-bold text-center animate-pulse flex items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F6F0}\uFE0F"), /* @__PURE__ */ React.createElement("span", null, "Obteniendo ubicaci\xF3n GPS obligatoria...")), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        disabled: loginLoading,
        className: "w-full py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase rounded-2xl tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
      },
      loginLoading ? /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full" }), /* @__PURE__ */ React.createElement("span", null, isWaitingGps ? "Obteniendo GPS obligatorio..." : "Verificando credenciales...")) : /* @__PURE__ */ React.createElement("span", null, "INGRESAR AL TURNO")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleEscapeToPassengers,
        className: "w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-2xl text-xs uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
      },
      "VOLVER A PASAJEROS"
    )))
  ) : (
    /* 6. PANEL DEL TAXISTA: TURNO OFICIAL CON CAMPOS FIJOS BLOQUEADOS (SOLO LECTURA) */
    /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 text-white rounded-3xl p-6 border-2 border-amber-400 shadow-2xl space-y-5 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center border-b border-slate-800 pb-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-emerald-400 tracking-wider" }, "Turno Oficial"), /* @__PURE__ */ React.createElement("h2", { className: "text-base font-black" }, loggedDriver && loggedDriver.name ? loggedDriver.name : "Conductor Autorizado"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-amber-400 font-mono font-bold" }, "Placa: ", loggedDriver ? loggedDriver.licensePlate || "" : "")), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleLogoutDriver,
        className: "text-xs font-bold text-red-400 hover:underline cursor-pointer"
      },
      "Cerrar Turno"
    )), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider" }, "Datos Fijos de Flota (Solo Lectura Central \u2022 Bloqueado)"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-black uppercase text-slate-400 mb-1" }, "Nombre del Conductor:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: loggedDriver ? loggedDriver.name || "" : "",
        readOnly: true,
        disabled: true,
        className: "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs cursor-not-allowed opacity-80 select-none"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-black uppercase text-slate-400 mb-1" }, "Placa Oficial:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: loggedDriver ? loggedDriver.licensePlate || "" : "",
        readOnly: true,
        disabled: true,
        className: "w-full px-3 py-2 bg-slate-950 border border-amber-400/40 rounded-xl text-amber-400 font-mono font-black text-xs cursor-not-allowed opacity-90 select-none"
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-black uppercase text-slate-400 mb-1" }, "Tipo de Unidad / Estilo:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: loggedDriver ? loggedDriver.unitType || loggedDriver.tipoUnidad || "" : "",
        readOnly: true,
        disabled: true,
        className: "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-bold text-xs cursor-not-allowed opacity-80 select-none"
      }
    ))))), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 bg-slate-900 p-4 rounded-2xl border border-slate-800 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-slate-400 mb-1 font-bold" }, "Zona de Cobertura (12 Puntos):"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: loggedDriver && (loggedDriver.currentZone || loggedDriver.zone) ? loggedDriver.currentZone || loggedDriver.zone : "Puntarenas Centro",
        onChange: async (e) => {
          const newZone = e.target.value;
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, currentZone: newZone, zone: newZone };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (err) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { currentZone: newZone, zone: newZone }).catch(() => {
            });
          }
        },
        className: "w-full p-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-white text-xs"
      },
      PUNTARENAS_ZONES.map((z) => /* @__PURE__ */ React.createElement("option", { key: z, value: z }, z))
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-slate-400 mb-1 font-bold" }, "Estado del Servicio:"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, status: "DISPONIBLE" };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { status: "DISPONIBLE" }).catch(() => {
            });
          }
        },
        className: "py-2 rounded-xl font-bold border " + (loggedDriver && loggedDriver.status === "DISPONIBLE" ? "bg-emerald-600 text-white border-emerald-500 shadow-sm" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "DISPONIBLE"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, status: "FUERA_DE_SERVICIO" };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { status: "FUERA_DE_SERVICIO" }).catch(() => {
            });
          }
        },
        className: "py-2 rounded-xl font-bold border " + (loggedDriver && loggedDriver.status === "FUERA_DE_SERVICIO" ? "bg-red-700 text-white border-red-600 shadow-sm" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "FUERA DE SERVICIO"
    ))), /* @__PURE__ */ React.createElement("details", { className: "group bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition-all" }, /* @__PURE__ */ React.createElement("summary", { className: "flex items-center justify-between px-3 py-2.5 cursor-pointer select-none font-bold text-amber-400 hover:bg-slate-900/80 transition-colors list-none" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", null, "\u2699\uFE0F"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] uppercase tracking-wider font-black" }, "Preferencias (SINPE \u2022 Mascotas \u2022 Mar\xEDa)")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-mono" }, loggedDriver && loggedDriver.acceptsSinpe ? "\u26A1SINPE" : "\u{1F4B5}Efec", " \u2022 ", loggedDriver && loggedDriver.acceptsPets ? "\u{1F43E}S\xED" : "\u{1F6AB}No"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-amber-400 transition-transform duration-200 group-open:rotate-180" }, "\u25BC"))), /* @__PURE__ */ React.createElement("div", { className: "p-3 border-t border-slate-800 space-y-3 bg-slate-900/50" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-slate-400 mb-1 font-bold text-[11px]" }, "Acepta SINPE M\xF3vil:"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, acceptsSinpe: true };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { acceptsSinpe: true }).catch(() => {
            });
          }
        },
        className: "py-1.5 rounded-xl font-bold border text-[11px] cursor-pointer " + (loggedDriver && loggedDriver.acceptsSinpe === true ? "bg-amber-400 text-slate-950 font-black border-amber-300" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "S\xCD SINPE"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, acceptsSinpe: false };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { acceptsSinpe: false }).catch(() => {
            });
          }
        },
        className: "py-1.5 rounded-xl font-bold border text-[11px] cursor-pointer " + (loggedDriver && loggedDriver.acceptsSinpe === false ? "bg-slate-800 text-white border-slate-700" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "Solo Efectivo"
    ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-slate-400 mb-1 font-bold text-[11px]" }, "Pet Friendly (Mascotas):"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, acceptsPets: true };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { acceptsPets: true }).catch(() => {
            });
          }
        },
        className: "py-1.5 rounded-xl font-bold border text-[11px] cursor-pointer " + (loggedDriver && loggedDriver.acceptsPets === true ? "bg-amber-400 text-slate-950 font-black border-amber-300" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "S\xCD Acepta \u{1F43E}"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, acceptsPets: false };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { acceptsPets: false }).catch(() => {
            });
          }
        },
        className: "py-1.5 rounded-xl font-bold border text-[11px] cursor-pointer " + (loggedDriver && loggedDriver.acceptsPets === false ? "bg-slate-800 text-white border-slate-700" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "NO Mascotas"
    ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-slate-400 mb-1 font-bold text-[11px]" }, "Estilo de Mar\xEDa (Tax\xEDmetro):"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, mariaStyle: "TIQUETE Y FECHA AL D\xCDA" };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { mariaStyle: "TIQUETE Y FECHA AL D\xCDA" }).catch(() => {
            });
          }
        },
        className: "py-1.5 px-1 text-[10px] rounded-xl font-bold border cursor-pointer " + (loggedDriver && loggedDriver.mariaStyle === "TIQUETE Y FECHA AL D\xCDA" ? "bg-amber-400 text-slate-950 font-black border-amber-300" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "\u{1F4DC} Con T\xEDquete al d\xEDa"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          const targetId = loggedDriver && loggedDriver.id && loggedDriver.id !== "admin-central-puerto-taxi" ? loggedDriver.id : "ZwLNJkI8JNPlz6jIFI5I";
          setLoggedDriver((prev) => {
            const upd = { ...prev, mariaStyle: "SIN TIQUETE" };
            try {
              localStorage.setItem("puertotaxi_logged_driver", JSON.stringify(upd));
            } catch (e) {
            }
            return upd;
          });
          if (window.firebaseDb && window.firebaseOps) {
            const { doc, updateDoc } = window.firebaseOps;
            await updateDoc(doc(window.firebaseDb, "flota_taxistas", String(targetId)), { mariaStyle: "SIN TIQUETE" }).catch(() => {
            });
          }
        },
        className: "py-1.5 px-1 text-[10px] rounded-xl font-bold border cursor-pointer " + (loggedDriver && loggedDriver.mariaStyle === "SIN TIQUETE" ? "bg-amber-400 text-slate-950 font-black border-amber-300" : "bg-slate-950 text-slate-400 border-slate-800")
      },
      "\u{1F3F7}\uFE0F Sin T\xEDquete"
    )))))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 border border-slate-800 rounded-2xl p-2.5 text-center text-xs text-slate-400 font-medium" }, drivers.filter((d) => d.status === "DISPONIBLE" && (!loggedDriver || d.id !== loggedDriver.id) && d.currentZone === (loggedDriver && loggedDriver.currentZone ? loggedDriver.currentZone : "Puntarenas Centro")).length, " unidades compa\xF1eras disponibles cerca en ", loggedDriver && loggedDriver.currentZone ? loggedDriver.currentZone : "Puntarenas Centro", "."), pendingRequest && /* @__PURE__ */ React.createElement("div", { className: "space-y-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider" }, "\u{1F4CB} Fila de Solicitudes Entrantes (", (Array.isArray(pendingRequest) ? pendingRequest : [pendingRequest]).length, ")"), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-slate-400 font-bold uppercase" }, "Orden de Llegada")), (Array.isArray(pendingRequest) ? [...pendingRequest] : [pendingRequest]).sort((a, b) => (a.createdAt || a.creadoEn || 0) - (b.createdAt || b.creadoEn || 0)).map((reqItem, index) => {
      const itemCreated = reqItem.creadoEn || reqItem.createdAt || Date.now();
      const itemCountdown = Math.max(0, Math.min(15, 15 - Math.floor((Date.now() - itemCreated) / 1e3)));
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: reqItem.firestoreId || reqItem.id || index,
          className: "p-3 bg-slate-900 border-2 border-amber-400 rounded-2xl space-y-2 shadow-xl"
        },
        /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-1.5 border-b border-slate-800 pb-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "bg-orange-600 text-white font-black px-1.5 py-0.5 rounded text-[9px] uppercase" }, "#", index + 1), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black text-amber-400 uppercase tracking-wider" }, "\u{1F6A8} ", reqItem.zone), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-mono font-black text-orange-400 bg-orange-950/90 border border-orange-500/60 px-2 py-0.5 rounded-full" }, "\u23F3 ", itemCountdown || driverRequestCountdown, "s")), /* @__PURE__ */ React.createElement("span", { className: "bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-md text-[10px] tracking-wide uppercase shrink-0" }, reqItem.passengerPublicId || "Pasajero #" + (reqItem.phone ? String(reqItem.phone).slice(-4) : "8888"))),
        /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950/90 border border-slate-800/90 px-3 py-2 rounded-xl" }, /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-amber-400/90 font-black uppercase tracking-wider block" }, "\u{1F4CD} Direcci\xF3n de Recogida:"), /* @__PURE__ */ React.createElement("p", { className: "text-sm sm:text-base font-black text-white leading-snug break-words mt-0.5" }, reqItem.exactAddress)),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-4 gap-1 text-[9px] text-center" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 py-1 px-1 rounded-lg border border-slate-800 truncate" }, /* @__PURE__ */ React.createElement("strong", { className: "text-amber-400 font-black" }, reqItem.paymentMethod)), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 py-1 px-1 rounded-lg border border-slate-800 truncate" }, /* @__PURE__ */ React.createElement("strong", { className: reqItem.hasPet ? "text-emerald-400 font-black" : "text-slate-400 font-bold" }, reqItem.hasPet ? "\u{1F43E} Mascota" : "Sin Mascota")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 py-1 px-1 rounded-lg border border-slate-800 truncate" }, /* @__PURE__ */ React.createElement("strong", { className: "text-slate-200 font-bold" }, String(reqItem.mariaStyle || "").includes("SIN") ? "Sin T\xEDquete" : "Con T\xEDquete")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-950 py-1 px-1 rounded-lg border border-slate-800 truncate" }, /* @__PURE__ */ React.createElement("strong", { className: "text-amber-300 font-black" }, reqItem.unitType))),
        /* @__PURE__ */ React.createElement("div", { className: "w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800" }, /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "bg-gradient-to-r from-amber-400 to-orange-500 h-1.5 rounded-full transition-all duration-200 ease-linear",
            style: { width: `${Math.max(0, Math.min(100, (itemCountdown || driverRequestCountdown) / 15 * 100))}%` }
          }
        )),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            onClick: () => handleAcceptRequest(reqItem),
            className: "w-full py-2.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 active:scale-[0.99] text-slate-950 font-black text-xs uppercase rounded-xl tracking-wider cursor-pointer shadow-lg shadow-amber-400/20 border border-amber-300 flex items-center justify-center gap-2 transition-all"
          },
          /* @__PURE__ */ React.createElement("span", null, "\u{1F695}"),
          /* @__PURE__ */ React.createElement("span", null, "ACEPTAR SERVICIO (", itemCountdown || driverRequestCountdown, "s)")
        )
      );
    })), emergencyGpsError && /* @__PURE__ */ React.createElement("div", { className: "p-3.5 bg-red-950/90 border-2 border-red-500 rounded-2xl text-center space-y-1 shadow-lg animate-pulse" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-black text-red-300 uppercase tracking-wider flex items-center justify-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", null, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("span", null, "ERROR DE SENSOR GPS POR HARDWARE")), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-200 leading-relaxed font-bold" }, emergencyGpsError)), emergencyAlert && emergencyAlert.alerta_activa ? /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-red-950/80 border-2 border-red-500 rounded-2xl text-center space-y-2 shadow-2xl" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-black text-red-300 animate-pulse uppercase tracking-wider flex items-center justify-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F6A8}"), /* @__PURE__ */ React.createElement("span", null, "PROTOCOLO 10-33 ACTIVO Y PERSISTENTE")), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-300 leading-relaxed" }, "Tu alerta de emergencia y coordenadas GPS est\xE1n transmiti\xE9ndose en tiempo real a la red oficial. Por protocolo estricto, este estado persiste ante recargas y solo puede ser desactivado por el Panel de Control Maestro (Central)."), /* @__PURE__ */ React.createElement(
      "a",
      {
        href: emergencyAlert.googleMapsUrl || `https://www.google.com/maps?q=${emergencyAlert.lat},${emergencyAlert.lng}`,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "inline-flex items-center gap-1 px-3 py-1.5 bg-amber-400 text-slate-950 font-black text-xs rounded-xl hover:bg-amber-300 transition-all shadow"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F4CD}"),
      /* @__PURE__ */ React.createElement("span", null, "Ver Coordenadas GPS en Google Maps (", emergencyAlert.lat, ", ", emergencyAlert.lng, ")")
    )) : /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: handleTriggerSilentEmergency,
        className: "w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase rounded-2xl border-2 border-red-400 shadow-xl cursor-pointer"
      },
      "\u{1F6A8} BOT\xD3N DE EMERGENCIA 10-33"
    ))
  )));
}
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch() {
  }
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-amber-400/10 border-2 border-amber-400/40 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-lg" }, "\u{1F695}"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase text-amber-400 tracking-wider mb-1" }, "Puerto Taxi Puntarenas"), /* @__PURE__ */ React.createElement("h1", { className: "text-xl font-black mb-2" }, "Conexi\xF3n Reestablecida"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mb-6 max-w-xs" }, "Pulsa el bot\xF3n para continuar con tu solicitud de taxi oficial:"), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            try {
              sessionStorage.clear();
            } catch (e) {
            }
            window.location.href = "/";
          },
          className: "px-6 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer"
        },
        "Volver a Iniciar"
      ));
    }
    return this.props.children;
  }
}
let isAppMounted = false;
function mountApp() {
  if (isAppMounted) return;
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  if (typeof React === "undefined" || typeof ReactDOM === "undefined") return;
  try {
    isAppMounted = true;
    if (ReactDOM.createRoot) {
      const root = ReactDOM.createRoot(rootEl);
      root.render(
        /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(App, null))
      );
    } else if (ReactDOM.render) {
      ReactDOM.render(
        /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(App, null)),
        rootEl
      );
    }
  } catch (err) {
    isAppMounted = false;
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp);
} else {
  mountApp();
}
window.addEventListener("load", mountApp);
