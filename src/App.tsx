import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    Button,
    Card,
    Checkbox,
    Combobox,
    Dialog,
    FilePicker,
    InputField,
    Select,
    TabGroup,
    Textarea,
    type FilePickerExternalRequest,
    type FileSelection,
    type ComboboxOption,
    type TabGroupTab,
    type SelectOption,
} from "react-ui-suite";
import ABOUT_CONTENT from "../ABOUT.md?raw";

type BoardOption = {
    name: string;
    fqbn: string;
};

type PortOption = {
    address: string;
    label: string;
    board_name?: string | null;
    board_fqbn?: string | null;
};

type CommandResult = {
    command: string;
    success: boolean;
    output: string;
};

type AppConfig = {
    $schemaVersion: number;
    sketchRoots: string[];
    defaultSketchPath: string;
    defaultBoardFqbn: string;
    defaultPort: string;
    defaultBaud: number;
    preferences: {
        theme: string;
        verboseCompile: boolean;
        verboseUpload: boolean;
        warnings: string;
        verifyAfterUpload: boolean;
        cleanBuild: boolean;
        autoOpenSerialOnUploadSuccess: boolean;
        additionalBoardManagerUrls: string[];
    };
    libraries: {
        selectedPaths: string[];
        allowInstalledFallback: boolean;
        showInstalledFromCli: boolean;
    };
    tools: {
        requiredCores: string[];
        programmer: string;
        boardOptions: Record<string, string>;
    };
    startupChecks: {
        enabled: boolean;
        checkArduinoCli: boolean;
        checkCoreIndex: boolean;
        checkRequiredCores: boolean;
        autoRunCoreUpdate: boolean;
        promptInstallMissingCores: boolean;
    };
    build: {
        buildRoot: string;
        extraCompileArgs: string[];
        extraUploadArgs: string[];
    };
    about: {
        readmePath: string;
    };
};

type ConfigResponse = {
    config: AppConfig;
    sourcePath: string | null;
    warnings: string[];
};

type StartupCheckResult = {
    ok: boolean;
    arduinoCliOk: boolean;
    missingCores: string[];
    notes: string[];
};

type InstalledLibrary = {
    name: string;
    version: string;
    latestVersion?: string | null;
    location: string;
    installDir: string;
};

type NativeFilePickerRequest = {
    directory: boolean;
    multiple: boolean;
    mode: "path" | "content" | "both";
    accept?: string;
    maxFiles?: number;
};

type NativeFileSelection = {
    path: string;
    name: string;
    size?: number;
    text?: string;
    bytes?: number[];
};

type ToolValueOption = {
    id: string;
    label: string;
};

type BoardToolMenuValue = {
    id: string;
    label: string;
    selected: boolean;
};

type BoardToolMenu = {
    id: string;
    label: string;
    defaultValueId: string | null;
    values: BoardToolMenuValue[];
};

type ToolSelectControl = {
    id: string;
    label: string;
    options: ToolValueOption[];
};

function createSyntheticFile(name: string, size?: number, text?: string, bytes?: Uint8Array): File {
    const payload = bytes ?? new Uint8Array(0);
    const safeSize = typeof size === "number" && Number.isFinite(size) ? Math.max(0, Math.floor(size)) : payload.byteLength;

    const fileLike = {
        name,
        size: safeSize,
        type: "",
        lastModified: Date.now(),
        async arrayBuffer() {
            return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        },
        slice(start?: number, end?: number, contentType?: string) {
            return new Blob([payload.slice(start, end)], { type: contentType });
        },
        stream() {
            return new Blob([payload]).stream();
        },
        async text() {
            if (typeof text === "string") {
                return text;
            }
            return new TextDecoder().decode(payload);
        },
    };

    return fileLike as unknown as File;
}

const DEFAULT_APP_CONFIG: AppConfig = {
    $schemaVersion: 1,
    sketchRoots: [],
    defaultSketchPath: "",
    defaultBoardFqbn: "",
    defaultPort: "",
    defaultBaud: 115200,
    preferences: {
        theme: "system",
        verboseCompile: false,
        verboseUpload: false,
        warnings: "default",
        verifyAfterUpload: false,
        cleanBuild: false,
        autoOpenSerialOnUploadSuccess: true,
        additionalBoardManagerUrls: [],
    },
    libraries: {
        selectedPaths: [],
        allowInstalledFallback: true,
        showInstalledFromCli: true,
    },
    tools: {
        requiredCores: [],
        programmer: "",
        boardOptions: {},
    },
    startupChecks: {
        enabled: true,
        checkArduinoCli: true,
        checkCoreIndex: true,
        checkRequiredCores: true,
        autoRunCoreUpdate: false,
        promptInstallMissingCores: true,
    },
    build: {
        buildRoot: "build",
        extraCompileArgs: [],
        extraUploadArgs: [],
    },
    about: {
        readmePath: "README.md",
    },
};

const BAUD_RATES = [
    300,
    1200,
    2400,
    4800,
    9600,
    14400,
    19200,
    28800,
    31250,
    38400,
    57600,
    74880,
    115200,
    230400,
    250000,
    500000,
    1000000,
    2000000,
];

const THEME_OPTIONS: SelectOption[] = [
    { label: "System", value: "system" },
    { label: "Light", value: "light" },
    { label: "Dark", value: "dark" },
];

const WARNING_OPTIONS: SelectOption[] = [
    { label: "None", value: "none" },
    { label: "Default", value: "default" },
    { label: "More", value: "more" },
    { label: "All", value: "all" },
];

const SERIAL_APPEND_OPTIONS: SelectOption[] = [
    { label: "No Line Ending", value: "none" },
    { label: "New Line", value: "lf" },
    { label: "Carriage Return", value: "cr" },
    { label: "LF and CR", value: "crlf" },
];

const TOOL_DEFAULTS = {
    CDCOnBoot: "default",
    CPUFreq: "160",
    EraseFlash: "none",
    FlashFreq: "80",
    FlashMode: "qio",
    FlashSize: "4M",
    JTAGAdapter: "default",
    PartitionScheme: "default",
    UploadSpeed: "921600",
} as const;

const TOOL_MENU_IDS = new Set<keyof typeof TOOL_DEFAULTS>([
    "CDCOnBoot",
    "CPUFreq",
    "EraseFlash",
    "FlashFreq",
    "FlashMode",
    "FlashSize",
    "JTAGAdapter",
    "PartitionScheme",
    "UploadSpeed",
]);

const TOOL_SELECT_CONTROLS: ToolSelectControl[] = [
    {
        id: "CPUFreq",
        label: "CPU Frequency",
        options: [
            { id: "160", label: "160MHz (WiFi)" },
            { id: "80", label: "80MHz (WiFi)" },
            { id: "40", label: "40MHz" },
            { id: "20", label: "20MHz" },
            { id: "10", label: "10MHz" },
        ],
    },
    {
        id: "FlashFreq",
        label: "Flash Frequency",
        options: [
            { id: "80", label: "80MHz" },
            { id: "40", label: "40MHz" },
        ],
    },
    {
        id: "FlashMode",
        label: "Flash Mode",
        options: [
            { id: "qio", label: "QIO" },
            { id: "dio", label: "DIO" },
            { id: "qout", label: "QOUT" },
            { id: "dout", label: "DOUT" },
        ],
    },
    {
        id: "FlashSize",
        label: "Flash Size",
        options: [
            { id: "4M", label: "4MB (32Mb)" },
            { id: "8M", label: "8MB (64Mb)" },
            { id: "2M", label: "2MB (16Mb)" },
            { id: "16M", label: "16MB (128Mb)" },
        ],
    },
    {
        id: "JTAGAdapter",
        label: "JTAG Adapter",
        options: [
            { id: "default", label: "Disabled" },
            { id: "builtin", label: "Integrated USB JTAG" },
            { id: "external", label: "FTDI Adapter" },
            { id: "bridge", label: "ESP USB Bridge" },
        ],
    },
    {
        id: "PartitionScheme",
        label: "Partition Scheme",
        options: [
            { id: "default", label: "Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)" },
            { id: "defaultffat", label: "Default 4MB with ffat (1.2MB APP/1.5MB FATFS)" },
            { id: "default_8MB", label: "8M with spiffs (3MB APP/1.5MB SPIFFS)" },
            { id: "minimal", label: "Minimal (1.3MB APP/700KB SPIFFS)" },
            { id: "no_ota", label: "No OTA (2MB APP/2MB SPIFFS)" },
            { id: "noota_3g", label: "No OTA (1MB APP/3MB SPIFFS)" },
            { id: "noota_ffat", label: "No OTA (2MB APP/2MB FATFS)" },
            { id: "noota_3gffat", label: "No OTA (1MB APP/3MB FATFS)" },
            { id: "huge_app", label: "Huge APP (3MB No OTA/1MB SPIFFS)" },
            { id: "min_spiffs", label: "Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)" },
            { id: "fatflash", label: "16M Flash (2MB APP/12.5MB FATFS)" },
            { id: "app3M_fat9M_16MB", label: "16M Flash (3MB APP/9.9MB FATFS)" },
            { id: "rainmaker", label: "RainMaker" },
        ],
    },
    {
        id: "UploadSpeed",
        label: "Upload Speed",
        options: [
            { id: "921600", label: "921600" },
            { id: "115200", label: "115200" },
            { id: "256000", label: "256000" },
            { id: "230400", label: "230400" },
            { id: "512000", label: "512000" },
        ],
    },
];

function nowStamp() {
    return new Date().toLocaleTimeString();
}

function splitMultiline(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function joinMultiline(values: string[]): string {
    return values.join("\n");
}

function parseBoardFqbn(rawFqbn: string): { baseFqbn: string; overrides: Record<string, string> } {
    const trimmed = rawFqbn.trim();
    if (!trimmed) {
        return { baseFqbn: "", overrides: {} };
    }

    const sections = trimmed.split(":");
    const baseFqbn = sections.slice(0, 3).join(":");
    const overridesSection = sections.slice(3).join(":");
    const overrides: Record<string, string> = {};

    if (!overridesSection) {
        return { baseFqbn, overrides };
    }

    for (const pair of overridesSection.split(",")) {
        const [rawKey, rawValue] = pair.split("=", 2);
        const key = rawKey?.trim();
        const value = rawValue?.trim();
        if (!key || !value) {
            continue;
        }
        overrides[key] = value;
    }

    return { baseFqbn, overrides };
}

function buildEffectiveFqbn(baseFqbn: string, overrides: Record<string, string>): string {
    const trimmedBase = baseFqbn.trim();
    if (!trimmedBase) {
        return "";
    }

    const pairs = Object.entries(overrides)
        .filter(([menuId, optionId]) => menuId.trim().length > 0 && optionId.trim().length > 0)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([menuId, optionId]) => `${menuId}=${optionId}`);

    if (pairs.length === 0) {
        return trimmedBase;
    }

    return `${trimmedBase}:${pairs.join(",")}`;
}

function sanitizeBoardOverrides(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized: Record<string, string> = {};
    for (const [key, rawValue] of entries) {
        if (typeof rawValue !== "string") {
            continue;
        }
        const menuId = key.trim();
        const optionId = rawValue.trim();
        if (!menuId || !optionId) {
            continue;
        }
        sanitized[menuId] = optionId;
    }

    return sanitized;
}

function overridesEqual(left: Record<string, string>, right: Record<string, string>): boolean {
    const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
    const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
    if (leftEntries.length !== rightEntries.length) {
        return false;
    }

    for (let index = 0; index < leftEntries.length; index += 1) {
        const [leftKey, leftValue] = leftEntries[index];
        const [rightKey, rightValue] = rightEntries[index];
        if (leftKey !== rightKey || leftValue !== rightValue) {
            return false;
        }
    }

    return true;
}

function sanitizeFixedToolOverrides(
    overrides: Record<string, string>,
    boardMenusById?: Record<string, BoardToolMenu>
): Record<string, string> {
    const validByMenu = new Map(
        TOOL_SELECT_CONTROLS.map((control) => [control.id, new Set(control.options.map((option) => option.id))])
    );
    validByMenu.set("CDCOnBoot", new Set(["default", "cdc"]));
    validByMenu.set("EraseFlash", new Set(["none", "all"]));

    const normalized: Record<string, string> = {};
    for (const [menuId, optionId] of Object.entries(overrides)) {
        if (!TOOL_MENU_IDS.has(menuId as keyof typeof TOOL_DEFAULTS)) {
            continue;
        }

        const menu = boardMenusById?.[menuId];
        if (menu) {
            const allowedValues = new Set(menu.values.map((value) => value.id));
            if (!allowedValues.has(optionId)) {
                continue;
            }

            const menuDefault = menu.defaultValueId ?? TOOL_DEFAULTS[menuId as keyof typeof TOOL_DEFAULTS];
            if (optionId !== menuDefault) {
                normalized[menuId] = optionId;
            }
            continue;
        }

        const allowedValues = validByMenu.get(menuId);
        if (!allowedValues || !allowedValues.has(optionId)) {
            continue;
        }
        const menuDefault = TOOL_DEFAULTS[menuId as keyof typeof TOOL_DEFAULTS];
        if (optionId !== menuDefault) {
            normalized[menuId] = optionId;
        }
    }

    return normalized;
}

export default function App() {
    const [boards, setBoards] = React.useState<BoardOption[]>([]);
    const [ports, setPorts] = React.useState<PortOption[]>([]);
    const [selectedBoard, setSelectedBoard] = React.useState("");
    const [boardOptionOverrides, setBoardOptionOverrides] = React.useState<Record<string, string>>({});
    const [boardToolMenusById, setBoardToolMenusById] = React.useState<Record<string, BoardToolMenu>>({});
    const [isLoadingBoardToolMenus, setIsLoadingBoardToolMenus] = React.useState(false);
    const [boardToolMenusError, setBoardToolMenusError] = React.useState<string | null>(null);
    const [selectedPort, setSelectedPort] = React.useState("");
    const [selectedBaud, setSelectedBaud] = React.useState(115200);
    const [serialLineEnding, setSerialLineEnding] = React.useState("none");
    const [sketchPath, setSketchPath] = React.useState("");
    const [serialInput, setSerialInput] = React.useState("");
    const [outputLog, setOutputLog] = React.useState<string[]>([]);
    const [serialLog, setSerialLog] = React.useState<string[]>([]);
    const [snapOutputToBottom, setSnapOutputToBottom] = React.useState(true);
    const [snapSerialToBottom, setSnapSerialToBottom] = React.useState(true);
    const [installedLibraries, setInstalledLibraries] = React.useState<InstalledLibrary[]>([]);
    const [isRefreshingLibraries, setIsRefreshingLibraries] = React.useState(false);
    const [isBusy, setIsBusy] = React.useState(false);
    const [isSerialOpen, setIsSerialOpen] = React.useState(false);
    const [isSerialConnecting, setIsSerialConnecting] = React.useState(false);
    const [filePickerError, setFilePickerError] = React.useState<string | undefined>(undefined);
    const [libraryPickerError, setLibraryPickerError] = React.useState<string | undefined>(undefined);
    const [appConfig, setAppConfig] = React.useState<AppConfig>(DEFAULT_APP_CONFIG);
    const [configSourcePath, setConfigSourcePath] = React.useState<string | null>(null);
    const [configWarnings, setConfigWarnings] = React.useState<string[]>([]);
    const [startupResult, setStartupResult] = React.useState<StartupCheckResult | null>(null);
    const [isCliInstallPromptOpen, setIsCliInstallPromptOpen] = React.useState(false);
    const [isInstallingCli, setIsInstallingCli] = React.useState(false);
    const [additionalUrlsDraft, setAdditionalUrlsDraft] = React.useState("");
    const [requiredCoresDraft, setRequiredCoresDraft] = React.useState("");
    const [isSettingsDialogOpen, setIsSettingsDialogOpen] = React.useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = React.useState(0);
    const appConfigRef = React.useRef<AppConfig>(DEFAULT_APP_CONFIG);
    const boardOptionOverridesRef = React.useRef<Record<string, string>>({});
    const outputLogHostRef = React.useRef<HTMLDivElement | null>(null);
    const serialLogHostRef = React.useRef<HTMLDivElement | null>(null);
    const boardsRefreshInFlightRef = React.useRef(false);
    const portsRefreshInFlightRef = React.useRef(false);
    const nativePickerOpenRef = React.useRef(false);

    React.useEffect(() => {
        const root = document.documentElement;
        const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const preferredTheme = appConfig.preferences.theme?.toLowerCase();

        const resolveTheme = () => {
            if (preferredTheme === "light" || preferredTheme === "dark") {
                return preferredTheme;
            }
            return systemQuery.matches ? "dark" : "light";
        };

        const applyTheme = () => {
            const theme = resolveTheme();
            root.setAttribute("data-theme", theme);
        };

        applyTheme();

        if (preferredTheme === "system") {
            const handleSystemThemeChange = () => {
                applyTheme();
            };

            if ("addEventListener" in systemQuery) {
                systemQuery.addEventListener("change", handleSystemThemeChange);
                return () => {
                    systemQuery.removeEventListener("change", handleSystemThemeChange);
                };
            }

            systemQuery.addListener(handleSystemThemeChange);
            return () => {
                systemQuery.removeListener(handleSystemThemeChange);
            };
        }
    }, [appConfig.preferences.theme]);

    React.useEffect(() => {
        setAdditionalUrlsDraft(joinMultiline(appConfig.preferences.additionalBoardManagerUrls));
        setRequiredCoresDraft(joinMultiline(appConfig.tools.requiredCores));
    }, [appConfig.preferences.additionalBoardManagerUrls, appConfig.tools.requiredCores]);

    const appendOutput = React.useCallback((line: string) => {
        setOutputLog((prev) => {
            const next = [...prev, `[${nowStamp()}] ${line}`];
            return next.slice(-600);
        });
    }, []);

    const appendSerial = React.useCallback((line: string) => {
        setSerialLog((prev) => {
            const next = [...prev, `[${nowStamp()}] ${line}`];
            return next.slice(-1200);
        });
    }, []);

    const scrollLogToBottom = React.useCallback((hostRef: React.RefObject<HTMLDivElement | null>) => {
        const textarea = hostRef.current?.querySelector("textarea");
        if (textarea instanceof HTMLTextAreaElement) {
            textarea.scrollTop = textarea.scrollHeight;
        }
    }, []);

    React.useEffect(() => {
        if (!snapOutputToBottom) {
            return;
        }
        scrollLogToBottom(outputLogHostRef);
    }, [outputLog, scrollLogToBottom, snapOutputToBottom]);

    React.useEffect(() => {
        if (!snapSerialToBottom) {
            return;
        }
        scrollLogToBottom(serialLogHostRef);
    }, [serialLog, scrollLogToBottom, snapSerialToBottom]);

    React.useEffect(() => {
        appConfigRef.current = appConfig;
    }, [appConfig]);

    React.useEffect(() => {
        boardOptionOverridesRef.current = boardOptionOverrides;
    }, [boardOptionOverrides]);

    const openNativePicker = React.useCallback(
        async (request: FilePickerExternalRequest): Promise<FileSelection[] | null> => {
            try {
                nativePickerOpenRef.current = true;
                const result = await invoke<NativeFileSelection[] | null>("pick_native_files", {
                    request: {
                        directory: request.directory,
                        multiple: request.multiple,
                        mode: request.mode,
                        accept: request.accept,
                        maxFiles: request.maxFiles,
                    } satisfies NativeFilePickerRequest,
                });

                if (result === null) {
                    return null;
                }

                const mapSelection = (selection: NativeFileSelection): FileSelection => {
                    const bytes = selection.bytes ? new Uint8Array(selection.bytes) : undefined;
                    const file = createSyntheticFile(selection.name, selection.size, selection.text, bytes);
                    const mapped: FileSelection = {
                        file,
                        path: selection.path,
                        size: selection.size,
                    };

                    if (request.mode === "content" || request.mode === "both") {
                        if (bytes) {
                            mapped.bytes = bytes;
                        }
                        if (typeof selection.text === "string") {
                            mapped.text = selection.text;
                        }
                    }

                    return mapped;
                };

                const maxFiles =
                    typeof request.maxFiles === "number" && Number.isFinite(request.maxFiles)
                        ? Math.max(1, Math.floor(request.maxFiles))
                        : undefined;

                const incomingSelections = result.map(mapSelection);
                let nextSelections = incomingSelections;

                if (request.multiple) {
                    const merged = [...request.currentSelections];
                    const seen = new Set<string>(
                        merged.map((selection) => selection.path?.toLowerCase() ?? selection.file.name.toLowerCase())
                    );

                    for (const selection of incomingSelections) {
                        const key = selection.path?.toLowerCase() ?? selection.file.name.toLowerCase();
                        if (!seen.has(key)) {
                            seen.add(key);
                            merged.push(selection);
                        }
                    }

                    nextSelections = merged;
                }

                return typeof maxFiles === "number" ? nextSelections.slice(0, maxFiles) : nextSelections;
            } catch (error) {
                appendOutput(`Native file picker failed: ${String(error)}`);
                return null;
            } finally {
                nativePickerOpenRef.current = false;
            }
        },
        [appendOutput]
    );

    const persistAppConfig = React.useCallback(
        async (nextConfig: AppConfig) => {
            try {
                const saved = await invoke<ConfigResponse>("save_app_config", {
                    config: nextConfig,
                });
                setConfigSourcePath((prev) => prev ?? saved.sourcePath ?? null);
                setConfigWarnings(saved.warnings);
                for (const warning of saved.warnings) {
                    appendOutput(`Config warning: ${warning}`);
                }
            } catch (error) {
                appendOutput(`Failed to save settings: ${String(error)}`);
            }
        },
        [appendOutput]
    );

    const updateAppConfig = React.useCallback(
        (mutate: (current: AppConfig) => AppConfig) => {
            const current = appConfigRef.current;
            const next = mutate(current);
            appConfigRef.current = next;
            setAppConfig(next);
            void persistAppConfig(next);
        },
        [persistAppConfig]
    );

    const boardOptions = React.useMemo<ComboboxOption<string>[]>(
        () =>
            boards.map((board) => ({
                id: board.fqbn,
                label: `${board.name} (${board.fqbn})`,
                value: board.fqbn,
            })),
        [boards]
    );

    const selectedBoardOption = React.useMemo(
        () => boardOptions.find((option) => option.id === selectedBoard) ?? null,
        [boardOptions, selectedBoard]
    );

    const effectiveBoardFqbn = React.useMemo(
        () => buildEffectiveFqbn(selectedBoard, boardOptionOverrides),
        [boardOptionOverrides, selectedBoard]
    );

    const portOptions = React.useMemo<SelectOption[]>(
        () =>
            ports.length > 0
                ? ports.map((port) => ({
                      label: port.label,
                      value: port.address,
                      description: port.board_name ?? undefined,
                  }))
                : [{ label: "No Ports Available", value: "", description: "Connect a board to detect serial ports." }],
        [ports]
    );

    const baudOptions = React.useMemo<SelectOption[]>(
        () =>
            BAUD_RATES.map((baud) => ({
                label: `${baud}`,
                value: `${baud}`,
            })),
        []
    );

    const refreshBoards = React.useCallback(async (options?: { silent?: boolean }) => {
        if (boardsRefreshInFlightRef.current) {
            return;
        }

        try {
            boardsRefreshInFlightRef.current = true;
            const result = await invoke<BoardOption[]>("list_arduino_boards");
            setBoards(result);
            setSelectedBoard((previous) => {
                const previousBase = parseBoardFqbn(previous).baseFqbn;
                if (result.length === 0) {
                    return "";
                }
                return result.some((board) => board.fqbn === previousBase) ? previousBase : result[0].fqbn;
            });
            if (!options?.silent) {
                appendOutput(`Loaded ${result.length} board definitions.`);
            }
        } catch (error) {
            if (!options?.silent) {
                appendOutput(`Board refresh failed: ${String(error)}`);
            }
        } finally {
            boardsRefreshInFlightRef.current = false;
        }
    }, [appendOutput]);

    const refreshPorts = React.useCallback(async (options?: { silent?: boolean }) => {
        if (portsRefreshInFlightRef.current) {
            return;
        }

        try {
            portsRefreshInFlightRef.current = true;
            const result = await invoke<PortOption[]>("list_arduino_ports");
            setPorts(result);
            setSelectedPort((previous) => {
                if (result.length === 0) {
                    return "";
                }
                return result.some((port) => port.address === previous) ? previous : result[0].address;
            });
            if (!options?.silent) {
                appendOutput(`Detected ${result.length} serial port(s).`);
            }

            const matchedBoard = result.find((port) => port.board_fqbn)?.board_fqbn;
            if (matchedBoard) {
                const matchedBase = parseBoardFqbn(matchedBoard).baseFqbn;
                setSelectedBoard((previous) => previous || matchedBase);
            }
        } catch (error) {
            if (!options?.silent) {
                appendOutput(`Port refresh failed: ${String(error)}`);
            }
        } finally {
            portsRefreshInFlightRef.current = false;
        }
    }, [appendOutput]);

    const refreshInstalledLibraries = React.useCallback(async () => {
        try {
            setIsRefreshingLibraries(true);
            const result = await invoke<InstalledLibrary[]>("list_installed_libraries");
            setInstalledLibraries(result);
            appendOutput(`Loaded ${result.length} installed libraries from arduino-cli.`);
        } catch (error) {
            appendOutput(`Installed library refresh failed: ${String(error)}`);
        } finally {
            setIsRefreshingLibraries(false);
        }
    }, [appendOutput]);

    const runStartupChecks = React.useCallback(async () => {
        try {
            const startup = await invoke<StartupCheckResult>("run_startup_checks");
            setStartupResult(startup);
            appendOutput(startup.ok ? "Startup checks passed." : "Startup checks reported issues.");

            if (!startup.arduinoCliOk) {
                appendOutput("arduino-cli is unavailable or not working.");
                setIsCliInstallPromptOpen(true);
            }

            if (startup.missingCores.length > 0) {
                appendOutput(`Missing cores: ${startup.missingCores.join(", ")}`);
            }

            for (const note of startup.notes) {
                appendOutput(`Startup check: ${note}`);
            }
        } catch (error) {
            appendOutput(`Startup checks failed: ${String(error)}`);
        }
    }, [appendOutput]);

    const installArduinoCli = React.useCallback(async () => {
        try {
            setIsInstallingCli(true);
            appendOutput("Attempting to install arduino-cli...");
            const result = await invoke<CommandResult>("install_arduino_cli");
            appendOutput(`$ ${result.command}`);
            appendOutput(result.output);

            if (!result.success) {
                appendOutput("arduino-cli installation attempt failed.");
                return;
            }

            appendOutput("arduino-cli installation succeeded. Re-running startup checks...");
            setIsCliInstallPromptOpen(false);
            await runStartupChecks();
            void refreshBoards();
        } catch (error) {
            appendOutput(`arduino-cli installation failed: ${String(error)}`);
        } finally {
            setIsInstallingCli(false);
        }
    }, [appendOutput, refreshBoards, runStartupChecks]);

    const persistBoardOptionOverrides = React.useCallback(
        (nextOverrides: Record<string, string>) => {
            setBoardOptionOverrides(nextOverrides);
            updateAppConfig((current) => ({
                ...current,
                tools: {
                    ...current.tools,
                    boardOptions: nextOverrides,
                },
            }));
        },
        [updateAppConfig]
    );

    const loadBoardToolMenus = React.useCallback(
        async (baseFqbn: string) => {
            const trimmedFqbn = baseFqbn.trim();
            if (!trimmedFqbn) {
                setBoardToolMenusById({});
                setBoardToolMenusError(null);
                setIsLoadingBoardToolMenus(false);
                return;
            }

            setIsLoadingBoardToolMenus(true);
            setBoardToolMenusById({});
            setBoardToolMenusError(null);
            try {
                const menus = await invoke<BoardToolMenu[]>("get_board_option_menus", { fqbn: trimmedFqbn });
                const nextMenusById: Record<string, BoardToolMenu> = {};
                for (const menu of menus) {
                    if (!TOOL_MENU_IDS.has(menu.id as keyof typeof TOOL_DEFAULTS)) {
                        continue;
                    }
                    nextMenusById[menu.id] = menu;
                }

                setBoardToolMenusById(nextMenusById);
                setBoardToolMenusError(null);

                const previousOverrides = boardOptionOverridesRef.current;
                const normalizedOverrides = sanitizeFixedToolOverrides(previousOverrides, nextMenusById);
                if (!overridesEqual(previousOverrides, normalizedOverrides)) {
                    const dropped = Object.entries(previousOverrides)
                        .filter(([menuId, optionId]) => normalizedOverrides[menuId] !== optionId)
                        .map(([menuId, optionId]) => `${menuId}=${optionId}`);
                    if (dropped.length > 0) {
                        appendOutput(
                            `Dropped unsupported board option override(s) for ${trimmedFqbn}: ${dropped.join(", ")}`
                        );
                    }
                    persistBoardOptionOverrides(normalizedOverrides);
                }
            } catch (error) {
                setBoardToolMenusById({});
                setBoardToolMenusError(String(error));
                appendOutput(`Unable to load board tool options for ${trimmedFqbn}: ${String(error)}`);
            } finally {
                setIsLoadingBoardToolMenus(false);
            }
        },
        [appendOutput, persistBoardOptionOverrides]
    );

    React.useEffect(() => {
        let isMounted = true;

        (async () => {
            try {
                const configResponse = await invoke<ConfigResponse>("get_app_config");
                if (!isMounted) {
                    return;
                }

                const parsedBoard = parseBoardFqbn(configResponse.config.defaultBoardFqbn);
                const savedOverrides = sanitizeBoardOverrides(configResponse.config.tools.boardOptions);
                const mergedOverrides = sanitizeFixedToolOverrides({
                    ...savedOverrides,
                    ...parsedBoard.overrides,
                });
                const normalizedConfig: AppConfig = {
                    ...configResponse.config,
                    defaultBoardFqbn: parsedBoard.baseFqbn,
                    tools: {
                        ...configResponse.config.tools,
                        boardOptions: mergedOverrides,
                    },
                };

                setAppConfig(normalizedConfig);
                setBoardOptionOverrides(mergedOverrides);
                setConfigSourcePath(configResponse.sourcePath);
                setConfigWarnings(configResponse.warnings);

                if (normalizedConfig.defaultSketchPath) {
                    setSketchPath(normalizedConfig.defaultSketchPath);
                }
                if (normalizedConfig.defaultBoardFqbn) {
                    setSelectedBoard(normalizedConfig.defaultBoardFqbn);
                }
                if (normalizedConfig.defaultPort) {
                    setSelectedPort(normalizedConfig.defaultPort);
                }
                if (normalizedConfig.defaultBaud > 0) {
                    setSelectedBaud(normalizedConfig.defaultBaud);
                }

                appendOutput(
                    configResponse.sourcePath
                        ? `Loaded config from ${configResponse.sourcePath}`
                        : "No config file found. Using built-in defaults."
                );

                for (const warning of configResponse.warnings) {
                    appendOutput(`Config warning: ${warning}`);
                }
            } catch (error) {
                appendOutput(`Failed to load config: ${String(error)}`);
            }

            if (!isMounted) {
                return;
            }
            await runStartupChecks();

        })();

        void refreshBoards();
        void refreshPorts();
        refreshInstalledLibraries();
        appendSerial("Serial monitor ready. Select port and baud, then connect.");
        return () => {
            isMounted = false;
        };
    }, [appendOutput, appendSerial, refreshBoards, refreshInstalledLibraries, refreshPorts, runStartupChecks]);

    React.useEffect(() => {
        const refreshPortsInBackground = () => {
            if (nativePickerOpenRef.current) {
                return;
            }
            void refreshPorts({ silent: true });
        };

        const refreshBoardsInBackground = () => {
            if (nativePickerOpenRef.current) {
                return;
            }
            void refreshBoards({ silent: true });
        };

        const handleWindowFocus = () => {
            refreshPortsInBackground();
            refreshBoardsInBackground();
        };

        window.addEventListener("focus", handleWindowFocus);
        const portsInterval = window.setInterval(() => {
            refreshPortsInBackground();
        }, 1000);

        return () => {
            window.removeEventListener("focus", handleWindowFocus);
            window.clearInterval(portsInterval);
        };
    }, [refreshBoards, refreshPorts]);

    React.useEffect(() => {
        void loadBoardToolMenus(selectedBoard);
    }, [loadBoardToolMenus, selectedBoard]);

    React.useEffect(() => {
        let disposed = false;
        const unlistenFns: Array<() => void> = [];

        (async () => {
            const offData = await listen<string>("serial-data", (event) => {
                appendSerial(event.payload);
            });
            if (disposed) {
                offData();
            } else {
                unlistenFns.push(offData);
            }

            const offErr = await listen<string>("serial-error", (event) => {
                appendSerial(`[ERROR] ${event.payload}`);
                setIsSerialOpen(false);
                setIsSerialConnecting(false);
            });
            if (disposed) {
                offErr();
            } else {
                unlistenFns.push(offErr);
            }
        })();

        return () => {
            disposed = true;
            for (const off of unlistenFns) {
                off();
            }
            invoke("close_serial_monitor").catch(() => {
                // ignore
            });
        };
    }, [appendSerial]);

    function handleSketchFilesChange(files: FileSelection[]) {
        if (files.length === 0) {
            setSketchPath("");
            setFilePickerError(undefined);
            updateAppConfig((current) => ({
                ...current,
                defaultSketchPath: "",
            }));
            return;
        }

        const firstSelection = files[0];
        const possiblePath = firstSelection.path?.trim();

        if (possiblePath) {
            setSketchPath(possiblePath);
            setFilePickerError(undefined);
            updateAppConfig((current) => ({
                ...current,
                defaultSketchPath: possiblePath,
            }));
            appendOutput(`Selected sketch file: ${possiblePath}`);
            return;
        }

        setSketchPath("");
        setFilePickerError("Path mode is enabled, but no file path was provided by this runtime.");
        appendOutput(`Selected "${firstSelection.file.name}" but no filesystem path was returned.`);
    }

    function handleLocalLibraryFoldersChange(files: FileSelection[]) {
        if (files.length === 0) {
            setLibraryPickerError(undefined);
            updateAppConfig((current) => ({
                ...current,
                libraries: {
                    ...current.libraries,
                    selectedPaths: [],
                },
            }));
            return;
        }

        const roots = new Set<string>();
        let missingPathCount = 0;

        for (const selection of files) {
            const pathValue = selection.path?.trim();
            if (!pathValue) {
                missingPathCount += 1;
                continue;
            }
            roots.add(pathValue);
        }

        if (roots.size === 0) {
            setLibraryPickerError("Path mode is enabled, but no directory paths were returned.");
            appendOutput("No local library folders were resolved from selection.");
            return;
        }

        setLibraryPickerError(undefined);
        const pickedPaths = Array.from(roots).sort((a, b) => a.localeCompare(b));
        updateAppConfig((current) => {
            return {
                ...current,
                libraries: {
                    ...current.libraries,
                    selectedPaths: pickedPaths,
                },
            };
        });

        appendOutput(`Selected ${pickedPaths.length} local library folder(s).`);
        if (missingPathCount > 0) {
            appendOutput(`${missingPathCount} selected file(s) had no filesystem path and were ignored.`);
        }
    }

    function handleBoardChange(option: ComboboxOption<string> | null) {
        const nextBoard = option?.id ?? "";
        setSelectedBoard(nextBoard);
        updateAppConfig((current) => ({
            ...current,
            defaultBoardFqbn: nextBoard,
        }));
    }

    function handlePortChange(value: string | null) {
        const nextPort = value ?? "";
        setSelectedPort(nextPort);
        updateAppConfig((current) => ({
            ...current,
            defaultPort: nextPort,
        }));
    }

    function handleBaudChange(value: string | null) {
        if (!value) {
            return;
        }

        const nextBaud = Number(value);
        setSelectedBaud(nextBaud);
        updateAppConfig((current) => ({
            ...current,
            defaultBaud: nextBaud,
        }));
    }

    async function runCompile() {
        if (!sketchPath) {
            appendOutput("Compile blocked: select a sketch file first.");
            return;
        }
        if (!effectiveBoardFqbn) {
            appendOutput("Compile blocked: select a board first.");
            return;
        }

        try {
            setIsBusy(true);
            appendOutput("Starting compile...");
            const result = await invoke<CommandResult>("compile_sketch", {
                sketchFile: sketchPath,
                fqbn: effectiveBoardFqbn,
            });
            appendOutput(`$ ${result.command}`);
            appendOutput(result.output);
            appendOutput(result.success ? "Compile succeeded." : "Compile failed.");
        } catch (error) {
            appendOutput(`Compile failed: ${String(error)}`);
        } finally {
            setIsBusy(false);
        }
    }

    async function runUpload() {
        if (!sketchPath) {
            appendOutput("Upload blocked: select a sketch file first.");
            return;
        }
        if (!effectiveBoardFqbn) {
            appendOutput("Upload blocked: select a board first.");
            return;
        }
        if (!selectedPort) {
            appendOutput("Upload blocked: select a port first.");
            return;
        }

        try {
            setIsBusy(true);
            if (isSerialOpen || isSerialConnecting) {
                appendOutput("Disconnecting serial monitor before upload...");
                await disconnectSerial();
            }
            appendOutput("Starting upload...");
            const result = await invoke<CommandResult>("upload_sketch", {
                sketchFile: sketchPath,
                fqbn: effectiveBoardFqbn,
                port: selectedPort,
            });
            appendOutput(`$ ${result.command}`);
            appendOutput(result.output);
            appendOutput(result.success ? "Upload succeeded." : "Upload failed.");
            if (result.success && appConfig.preferences.autoOpenSerialOnUploadSuccess && !isSerialOpen) {
                await connectSerial();
            }
        } catch (error) {
            appendOutput(`Upload failed: ${String(error)}`);
        } finally {
            setIsBusy(false);
        }
    }

    async function connectSerial() {
        if (!selectedPort) {
            appendSerial("Select a serial port before connecting.");
            return;
        }

        setIsSerialConnecting(true);
        try {
            await invoke("open_serial_monitor", {
                port: selectedPort,
                baudRate: selectedBaud,
            });
            setIsSerialOpen(true);
            appendSerial(`Connected to ${selectedPort} at ${selectedBaud} baud.`);
        } catch (error) {
            setIsSerialOpen(false);
            appendSerial(`Connect failed: ${String(error)}`);
        } finally {
            setIsSerialConnecting(false);
        }
    }

    async function disconnectSerial() {
        try {
            await invoke("close_serial_monitor");
        } finally {
            setIsSerialOpen(false);
            setIsSerialConnecting(false);
            appendSerial("Serial monitor disconnected.");
        }
    }

    async function sendSerial() {
        if (!serialInput) {
            return;
        }
        if (!isSerialOpen) {
            appendSerial("Cannot send: serial monitor is not connected.");
            return;
        }

        const suffix =
            serialLineEnding === "none" ? "" : serialLineEnding === "cr" ? "\r" : serialLineEnding === "crlf" ? "\r\n" : "\n";
        const payload = serialInput + suffix;

        try {
            await invoke("write_serial_monitor", { payload });
            appendSerial(`[TX] ${serialInput}`);
            setSerialInput("");
        } catch (error) {
            appendSerial(`Send failed: ${String(error)}`);
        }
    }

    function clearOutputLog() {
        setOutputLog([]);
    }

    function clearSerialLog() {
        setSerialLog([]);
    }

    function toggleSnapOutputToBottom() {
        setSnapOutputToBottom((previous) => {
            const next = !previous;
            if (next) {
                requestAnimationFrame(() => {
                    scrollLogToBottom(outputLogHostRef);
                });
            }
            return next;
        });
    }

    function toggleSnapSerialToBottom() {
        setSnapSerialToBottom((previous) => {
            const next = !previous;
            if (next) {
                requestAnimationFrame(() => {
                    scrollLogToBottom(serialLogHostRef);
                });
            }
            return next;
        });
    }

    const setFixedToolValue = React.useCallback(
        (menuId: keyof typeof TOOL_DEFAULTS, nextValue: string) => {
            const defaultValue = boardToolMenusById[menuId]?.defaultValueId ?? TOOL_DEFAULTS[menuId];
            const currentOverrides = boardOptionOverridesRef.current;
            const trimmedValue = nextValue.trim();

            if (!trimmedValue || trimmedValue === defaultValue) {
                if (!(menuId in currentOverrides)) {
                    return;
                }
                const nextOverrides = { ...currentOverrides };
                delete nextOverrides[menuId];
                persistBoardOptionOverrides(nextOverrides);
                return;
            }

            if (currentOverrides[menuId] === trimmedValue) {
                return;
            }

            persistBoardOptionOverrides({
                ...currentOverrides,
                [menuId]: trimmedValue,
            });
        },
        [boardToolMenusById, persistBoardOptionOverrides]
    );

    const installedLibrariesText = React.useMemo(() => {
        if (installedLibraries.length === 0) {
            return "";
        }

        return installedLibraries
            .map((library) => {
                const versionPart = library.version ? `v${library.version}` : "version unknown";
                const latestPart =
                    library.latestVersion && library.latestVersion !== library.version
                        ? ` (latest ${library.latestVersion})`
                        : "";
                return `${library.name} - ${versionPart}${latestPart} [${library.location}] ${library.installDir}`;
            })
            .join("\n");
    }, [installedLibraries]);

    const cdcMenu = boardToolMenusById.CDCOnBoot;
    const eraseFlashMenu = boardToolMenusById.EraseFlash;
    const cdcDefaultValue = cdcMenu?.defaultValueId ?? TOOL_DEFAULTS.CDCOnBoot;
    const eraseFlashDefaultValue = eraseFlashMenu?.defaultValueId ?? TOOL_DEFAULTS.EraseFlash;
    const cdcEnabledValue =
        cdcMenu?.values.find((value) => value.id !== cdcDefaultValue && /enabled/i.test(value.label))?.id ??
        cdcMenu?.values.find((value) => value.id !== cdcDefaultValue)?.id ??
        "cdc";
    const eraseEnabledValue =
        eraseFlashMenu?.values.find((value) => value.id !== eraseFlashDefaultValue && /enabled/i.test(value.label))?.id ??
        eraseFlashMenu?.values.find((value) => value.id !== eraseFlashDefaultValue)?.id ??
        "all";
    const cdcCurrentValue = boardOptionOverrides.CDCOnBoot ?? cdcDefaultValue;
    const eraseCurrentValue = boardOptionOverrides.EraseFlash ?? eraseFlashDefaultValue;
    const cdcEnabled = cdcCurrentValue === cdcEnabledValue;
    const eraseFlashEnabled = eraseCurrentValue === eraseEnabledValue;

    const topTabs = React.useMemo<TabGroupTab[]>(
        () => [
            {
                label: "Preferences",
                content: (
                    <div className="app-settings-compact app-preferences-pane">
                        <div className="app-settings-inline">
                            <div className="app-setting-field">
                                <Select
                                    label="Theme"
                                    options={THEME_OPTIONS}
                                    value={appConfig.preferences.theme}
                                    onChange={(value) => {
                                        if (!value) {
                                            return;
                                        }
                                        updateAppConfig((current) => ({
                                            ...current,
                                            preferences: {
                                                ...current.preferences,
                                                theme: value,
                                            },
                                        }));
                                    }}
                                />
                            </div>
                            <div className="app-setting-field">
                                <Select
                                    label="Compiler warnings"
                                    options={WARNING_OPTIONS}
                                    value={appConfig.preferences.warnings}
                                    onChange={(value) => {
                                        if (!value) {
                                            return;
                                        }
                                        updateAppConfig((current) => ({
                                            ...current,
                                            preferences: {
                                                ...current.preferences,
                                                warnings: value,
                                            },
                                        }));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="app-settings-toggles">
                            <Checkbox
                                label="Verbose compile output"
                                checked={appConfig.preferences.verboseCompile}
                                onChange={(checked) =>
                                    updateAppConfig((current) => ({
                                        ...current,
                                        preferences: {
                                            ...current.preferences,
                                            verboseCompile: checked,
                                        },
                                    }))
                                }
                            />
                            <Checkbox
                                label="Verbose upload output"
                                checked={appConfig.preferences.verboseUpload}
                                onChange={(checked) =>
                                    updateAppConfig((current) => ({
                                        ...current,
                                        preferences: {
                                            ...current.preferences,
                                            verboseUpload: checked,
                                        },
                                    }))
                                }
                            />
                            <Checkbox
                                label="Verify after upload"
                                checked={appConfig.preferences.verifyAfterUpload}
                                onChange={(checked) =>
                                    updateAppConfig((current) => ({
                                        ...current,
                                        preferences: {
                                            ...current.preferences,
                                            verifyAfterUpload: checked,
                                        },
                                    }))
                                }
                            />
                            <Checkbox
                                label="Clean build"
                                checked={appConfig.preferences.cleanBuild}
                                onChange={(checked) =>
                                    updateAppConfig((current) => ({
                                        ...current,
                                        preferences: {
                                            ...current.preferences,
                                            cleanBuild: checked,
                                        },
                                    }))
                                }
                            />
                            <Checkbox
                                label="Auto-open serial after upload"
                                checked={appConfig.preferences.autoOpenSerialOnUploadSuccess}
                                onChange={(checked) =>
                                    updateAppConfig((current) => ({
                                        ...current,
                                        preferences: {
                                            ...current.preferences,
                                            autoOpenSerialOnUploadSuccess: checked,
                                        },
                                    }))
                                }
                            />
                        </div>
                        <Textarea
                            className="app-textarea-board-urls"
                            label="Additional board manager URLs"
                            description="One URL per line"
                            value={additionalUrlsDraft}
                            onChange={(event) => setAdditionalUrlsDraft(event.target.value)}
                            onBlur={() => {
                                updateAppConfig((current) => ({
                                    ...current,
                                    preferences: {
                                        ...current.preferences,
                                        additionalBoardManagerUrls: splitMultiline(additionalUrlsDraft),
                                    },
                                }));
                            }}
                            resizeDirection="none"
                            rows={2}
                            showCount={false}
                        />
                    </div>
                ),
            },
            {
                label: "Tools",
                content: (
                    <div className="app-stack app-small-text app-muted-text app-tools-pane">
                        <div className="app-tools-board-options">
                            <div className="app-tools-board-options-grid">
                                <div className="app-tools-board-option-item">
                                    <p className="rui-select__label rui-text-wrap">USB CDC On Boot</p>
                                    <Button
                                        type="button"
                                        onClick={() =>
                                            setFixedToolValue("CDCOnBoot", cdcEnabled ? cdcDefaultValue : cdcEnabledValue)
                                        }
                                        disabled={isLoadingBoardToolMenus}
                                    >
                                        {cdcEnabled ? "Enabled" : "Disabled"}
                                    </Button>
                                </div>

                                <div className="app-tools-board-option-item">
                                    <p className="rui-select__label rui-text-wrap">Erase Flash Before Upload</p>
                                    <Button
                                        type="button"
                                        onClick={() =>
                                            setFixedToolValue(
                                                "EraseFlash",
                                                eraseFlashEnabled ? eraseFlashDefaultValue : eraseEnabledValue
                                            )
                                        }
                                        disabled={isLoadingBoardToolMenus}
                                    >
                                        {eraseFlashEnabled ? "Enabled" : "Disabled"}
                                    </Button>
                                </div>

                                {TOOL_SELECT_CONTROLS.map((control) => {
                                    const menu = boardToolMenusById[control.id];
                                    const optionSource = menu
                                        ? menu.values.map((value) => ({
                                              id: value.id,
                                              label: value.label,
                                          }))
                                        : control.options;
                                    const selectOptions: SelectOption[] = optionSource.map((option) => ({
                                        label: option.label,
                                        value: option.id,
                                    }));
                                    const defaultValue = menu?.defaultValueId ?? TOOL_DEFAULTS[control.id as keyof typeof TOOL_DEFAULTS];
                                    const value = boardOptionOverrides[control.id] ?? defaultValue;

                                    return (
                                        <div className="app-tools-board-option-item" key={control.id}>
                                            <Select
                                                label={menu?.label || control.label}
                                                options={selectOptions}
                                                value={value}
                                                disabled={isLoadingBoardToolMenus}
                                                onChange={(next) => {
                                                    if (next) {
                                                        setFixedToolValue(
                                                            control.id as keyof typeof TOOL_DEFAULTS,
                                                            next
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                label: "Libraries",
                content: (
                    <div className="app-stack app-small-text app-muted-text app-libraries-pane">
                        <Checkbox
                            label="Show installed libraries from arduino-cli"
                            checked={appConfig.libraries.showInstalledFromCli}
                            onChange={(checked) =>
                                updateAppConfig((current) => ({
                                    ...current,
                                    libraries: {
                                        ...current.libraries,
                                        // Keep both flags in sync for backward config compatibility.
                                        allowInstalledFallback: checked,
                                        showInstalledFromCli: checked,
                                    },
                                }))
                            }
                        />
                        {appConfig.libraries.showInstalledFromCli && (
                            <>
                                <Button onClick={refreshInstalledLibraries} disabled={isRefreshingLibraries}>
                                    {isRefreshingLibraries ? "Refreshing..." : "Refresh installed libraries"}
                                </Button>
                                <Textarea
                                    className="app-textarea-installed-libraries"
                                    label={`Installed libraries (${installedLibraries.length})`}
                                    value={installedLibrariesText}
                                    readOnly
                                    resizeDirection="none"
                                    rows={10}
                                    showCount={false}
                                    placeholder="No installed libraries found."
                                />
                            </>
                        )}
                    </div>
                ),
            },
            {
                label: "About",
                content: (
                    <div className="app-stack app-small-text app-muted-text app-about-pane">
                        <Textarea
                            className="app-textarea-about"
                            label=""
                            value={ABOUT_CONTENT}
                            readOnly
                            resizeDirection="none"
                            rows={16}
                            showCount={false}
                            placeholder="README content unavailable at build time."
                        />
                    </div>
                ),
            },
        ],
        [
            additionalUrlsDraft,
            appConfig,
            boardToolMenusById,
            boardToolMenusError,
            boardOptionOverrides,
            cdcDefaultValue,
            cdcEnabled,
            cdcEnabledValue,
            cdcMenu,
            eraseEnabledValue,
            eraseFlashDefaultValue,
            eraseFlashEnabled,
            eraseFlashMenu,
            isLoadingBoardToolMenus,
            isRefreshingLibraries,
            installedLibraries.length,
            installedLibrariesText,
            refreshInstalledLibraries,
            selectedBoard,
            setFixedToolValue,
            updateAppConfig,
        ]
    );

    return (
        <div className="app-shell">
            <header className="app-header">
                <Button
                    type="button"
                    className="app-settings-button"
                    aria-label="Open settings"
                    onClick={() => setIsSettingsDialogOpen(true)}
                >
                    <svg
                        className="app-settings-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.48.48 0 00.12-.61l-1.92-3.32a.49.49 0 00-.58-.22l-2.39.96a7.18 7.18 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.93 2h-3.86a.48.48 0 00-.48.41l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.49.49 0 00-.58.22L2.71 8.47a.48.48 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.48.48 0 00-.12.61l1.92 3.32c.13.22.39.31.62.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.24.41.48.41h3.86c.24 0 .44-.17.48-.41l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96c.23.09.49 0 .62-.22l1.92-3.32a.48.48 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"
                            fill="currentColor"
                        />
                    </svg>
                </Button>
                <div className="app-header-content">
                    <Card
                        className="app-card"
                    >
                        <div className="app-config-split-grid">
                            <div className="app-config-pane">
                                <div className="app-picker-container">
                                    <div className="app-picker-scroll">
                                        <FilePicker
                                            label="Local library folder(s)"
                                            description="Select one or more library root folders. These are passed to compile with --library."
                                            dropzoneLabel="Drop a library folder selection here or click to browse"
                                            mode="path"
                                            directory
                                            multiple
                                            externalPicker={openNativePicker}
                                            onFilesChange={handleLocalLibraryFoldersChange}
                                            error={libraryPickerError}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="app-config-pane">
                                <div className="app-picker-container">
                                    <div className="app-picker-scroll">
                                        <FilePicker
                                            label="Sketch file"
                                            description="Pick an Arduino sketch file"
                                            dropzoneLabel="Drop a sketch file here or click to browse"
                                            accept=".ino"
                                            maxFiles={1}
                                            mode="path"
                                            externalPicker={openNativePicker}
                                            onFilesChange={handleSketchFilesChange}
                                            error={filePickerError}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </header>
            <Dialog
                open={isSettingsDialogOpen}
                onClose={() => setIsSettingsDialogOpen(false)}
                modal={true}
                draggable={false}
            >
                <div className="app-settings-tabs">
                    <TabGroup
                        tabs={topTabs}
                        fill="partial"
                        align="start"
                        size={150}
                        active={activeSettingsTab}
                        onActiveChange={setActiveSettingsTab}
                    />
                </div>
            </Dialog>
            <Dialog
                open={isCliInstallPromptOpen}
                onClose={() => {
                    if (!isInstallingCli) {
                        setIsCliInstallPromptOpen(false);
                    }
                }}
                modal={true}
                draggable={false}
            >
                <div className="app-stack app-settings-tabs">
                    <h3>Install arduino-cli</h3>
                    <p>
                        ALDER detected that <code>arduino-cli</code> is unavailable. Install it now to enable board discovery,
                        compile, upload, and library listing features.
                    </p>
                    <div className="app-settings-inline">
                        <Button onClick={installArduinoCli} disabled={isInstallingCli}>
                            {isInstallingCli ? "Installing..." : "Install arduino-cli"}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setIsCliInstallPromptOpen(false)}
                            disabled={isInstallingCli}
                        >
                            Not now
                        </Button>
                    </div>
                </div>
            </Dialog>

            <main className="app-main-grid">
                <Card className="app-card app-main-full-span">
                    <div className="app-device-grid">
                        <div className="app-device-field">
                            <div className="app-field-label app-board-label">Board</div>
                            <Combobox
                                ariaLabel="Board"
                                options={boardOptions}
                                value={selectedBoardOption}
                                onChange={handleBoardChange}
                                placeholder={boards.length > 0 ? "Select board..." : "No boards loaded"}
                            />
                        </div>
                        <div className="app-device-field">
                            <div className="app-field-label app-board-label">Port</div>
                            <Select
                                label=""
                                ariaLabel="Port"
                                options={portOptions}
                                value={selectedPort}
                                onChange={handlePortChange}
                                placeholder="Select port..."
                            />
                        </div>
                    </div>
                </Card>
                <Card
                    className="app-card app-panel-card app-output-card"
                >
                    <div className="app-panel-content app-output-content">
                        <div className="app-output-toolbar">
                            <div className="app-output-toolbar-left">
                                <Button onClick={runCompile} disabled={isBusy}>
                                    {isBusy ? "Working..." : "Compile"}
                                </Button>
                                <Button onClick={runUpload} disabled={isBusy}>
                                    {isBusy ? "Working..." : "Upload"}
                                </Button>
                            </div>
                            <div className="app-output-heading">Output</div>
                            <div className="app-output-toolbar-right">
                                <Button
                                    type="button"
                                    className="app-icon-button"
                                    aria-label="Clear output log"
                                    title="Clear output log"
                                    onClick={clearOutputLog}
                                >
                                    <svg className="app-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                        <path d="M5.5 6.5h13" />
                                        <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
                                        <path d="M7.5 6.5 8.3 18a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-11.5" />
                                        <path d="M10 10v6" />
                                        <path d="M12 10v6" />
                                        <path d="M14 10v6" />
                                    </svg>
                                </Button>
                                <Button
                                    type="button"
                                    className="app-icon-button"
                                    aria-label={snapOutputToBottom ? "Turn output snap-to-bottom off" : "Turn output snap-to-bottom on"}
                                    title={snapOutputToBottom ? "Output snap to bottom: on" : "Output snap to bottom: off"}
                                    onClick={toggleSnapOutputToBottom}
                                >
                                    <svg className="app-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                        <path d="M12 4.5v10" />
                                        <path d="m8.5 11 3.5 3.5 3.5-3.5" />
                                        <path d="M5 19h14" />
                                        {!snapOutputToBottom && <path d="M6 6l12 12" />}
                                    </svg>
                                </Button>
                            </div>
                        </div>
                        <div ref={outputLogHostRef} className="app-log-host">
                            <Textarea
                                className="app-log-textarea"
                                value={outputLog.join("\n")}
                                readOnly
                                resizeDirection="none"
                                showCount={false}
                            />
                        </div>
                    </div>
                </Card>

                <Card className="app-card app-panel-card app-serial-card">
                    <div className="app-stack">
                        <div className="app-serial-toolbar">
                            <div className="app-serial-toolbar-left">
                                <Button
                                    className={`app-serial-connect-button ${
                                        isSerialOpen
                                            ? "app-serial-connect-open"
                                            : isSerialConnecting
                                              ? "app-serial-connect-connecting"
                                              : "app-serial-connect-closed"
                                    }`}
                                    onClick={isSerialOpen ? disconnectSerial : connectSerial}
                                    disabled={isSerialConnecting}
                                    aria-label={
                                        isSerialOpen
                                            ? "Disconnect serial monitor"
                                            : isSerialConnecting
                                              ? "Connecting serial monitor"
                                              : "Connect serial monitor"
                                    }
                                    title={
                                        isSerialOpen
                                            ? "Connected"
                                            : isSerialConnecting
                                              ? "Connecting"
                                              : "Disconnected"
                                    }
                                >
                                    {isSerialOpen ? "Connected" : isSerialConnecting ? "Connecting..." : "Disconnected"}
                                </Button>
                            </div>
                            <div className="app-serial-heading">Serial Monitor</div>
                            <div className="app-serial-toolbar-right">
                                <Select
                                    className="app-serial-select-ending"
                                    label=""
                                    ariaLabel="Serial line ending"
                                    options={SERIAL_APPEND_OPTIONS}
                                    value={serialLineEnding}
                                    onChange={(value) => {
                                        if (value) {
                                            setSerialLineEnding(value);
                                        }
                                    }}
                                />
                                <Select
                                    className="app-serial-select-baud"
                                    label=""
                                    ariaLabel="Serial baud rate"
                                    options={baudOptions}
                                    value={`${selectedBaud}`}
                                    onChange={handleBaudChange}
                                />
                                <Button
                                    type="button"
                                    className="app-icon-button"
                                    aria-label="Clear serial log"
                                    title="Clear serial log"
                                    onClick={clearSerialLog}
                                >
                                    <svg className="app-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                        <path d="M5.5 6.5h13" />
                                        <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
                                        <path d="M7.5 6.5 8.3 18a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-11.5" />
                                        <path d="M10 10v6" />
                                        <path d="M12 10v6" />
                                        <path d="M14 10v6" />
                                    </svg>
                                </Button>
                                <Button
                                    type="button"
                                    className="app-icon-button"
                                    aria-label={snapSerialToBottom ? "Turn snap-to-bottom off" : "Turn snap-to-bottom on"}
                                    title={snapSerialToBottom ? "Snap to bottom: on" : "Snap to bottom: off"}
                                    onClick={toggleSnapSerialToBottom}
                                >
                                    <svg className="app-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                        <path d="M12 4.5v10" />
                                        <path d="m8.5 11 3.5 3.5 3.5-3.5" />
                                        <path d="M5 19h14" />
                                        {!snapSerialToBottom && <path d="M6 6l12 12" />}
                                    </svg>
                                </Button>
                            </div>
                        </div>
                        <div ref={serialLogHostRef} className="app-log-host">
                            <Textarea
                                className="app-log-textarea"
                                value={serialLog.join("\n")}
                                readOnly
                                resizeDirection="none"
                                showCount={false}
                            />
                        </div>
                        <div className="app-serial-row">
                            <div className="app-grow">
                                <InputField
                                    value={serialInput}
                                    placeholder="Type text to send to serial..."
                                    onChange={(event) => setSerialInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            sendSerial();
                                        }
                                    }}
                                />
                            </div>
                            <Button
                                className="app-icon-button"
                                aria-label="Send serial input"
                                title="Send"
                                onClick={sendSerial}
                            >
                                <svg className="app-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M3 11.5 21 3l-8.5 18-2.1-6.4L3 11.5z" />
                                    <path d="M10.4 14.6 21 3" />
                                </svg>
                            </Button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
}



