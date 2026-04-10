/**
 * ScreenRouter - Keyboard-navigable tab bar for switching between app screens.
 *
 * Provides a tabbed interface with:
 * - Five ordered screens: Board, Detail, Activity, Agents, Settings
 * - Number keys (1-5) for direct tab selection
 * - Tab/Shift+Tab for cycling with wrap-around
 * - Visual tab bar with active indicator
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

/**
 * Available screen identifiers.
 */
export type ScreenId = "board" | "detail" | "activity" | "agents" | "settings";

/**
 * Screen definition with metadata for rendering and keyboard shortcuts.
 */
export interface Screen {
  id: ScreenId;
  label: string;
  shortcut: string;
}

/**
 * Ordered list of all available screens.
 */
export const SCREENS: Screen[] = [
  { id: "board", label: "Board", shortcut: "1" },
  { id: "detail", label: "Detail", shortcut: "2" },
  { id: "activity", label: "Activity", shortcut: "3" },
  { id: "agents", label: "Agents", shortcut: "4" },
  { id: "settings", label: "Settings", shortcut: "5" },
] as const;

/**
 * Props for individual screen components.
 */
export interface ScreenComponentProps {
  /** The active screen ID (for conditional rendering) */
  activeScreen: ScreenId;
}

/**
 * Props for the ScreenRouter component.
 */
export interface ScreenRouterProps {
  /**
   * Render function for each screen.
   * Receives the screen ID and should return the screen component.
   */
  children: (props: ScreenComponentProps) => React.ReactNode;
}

/**
 * ScreenRouter provides keyboard-navigable tab switching with visual tab bar.
 *
 * Features:
 * - Tab bar displays all screens with active indicator
 * - Number keys 1-5 jump directly to corresponding tab
 * - Tab/Shift+Tab cycle forward/backward with wrap-around
 * - Active screen component renders below the tab bar
 *
 * @example
 * ```tsx
 * <ScreenRouter>
 *   {({ activeScreen }) => (
 *     <>
 *       {activeScreen === "board" && <BoardScreen />}
 *       {activeScreen === "detail" && <DetailScreen />}
 *       {activeScreen === "activity" && <ActivityScreen />}
 *       {activeScreen === "agents" && <AgentsScreen />}
 *       {activeScreen === "settings" && <SettingsScreen />}
 *     </>
 *   )}
 * </ScreenRouter>
 * ```
 */
export function ScreenRouter({ children }: ScreenRouterProps): React.ReactNode {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("board");

  // Navigate to a specific screen by index
  const navigateToIndex = useCallback((index: number) => {
    const normalizedIndex = ((index % SCREENS.length) + SCREENS.length) % SCREENS.length;
    setActiveScreen(SCREENS[normalizedIndex].id);
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    // Number keys 1-5 for direct selection
    const num = parseInt(input, 10);
    if (num >= 1 && num <= SCREENS.length) {
      setActiveScreen(SCREENS[num - 1].id);
      return;
    }

    // Tab cycles forward with wrap-around
    if (key.tab) {
      if (key.shift) {
        // Shift+Tab: go backward
        const currentIndex = SCREENS.findIndex((s) => s.id === activeScreen);
        navigateToIndex(currentIndex - 1);
      } else {
        // Tab: go forward
        const currentIndex = SCREENS.findIndex((s) => s.id === activeScreen);
        navigateToIndex(currentIndex + 1);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {/* Tab Bar */}
      <Box flexDirection="row" flexWrap="wrap" gap={0}>
        {SCREENS.map((screen, index) => {
          const isActive = screen.id === activeScreen;
          const shortcutNum = index + 1;
          return (
            <Box key={screen.id} paddingX={1}>
              <Text
                bold={isActive}
                backgroundColor={isActive ? "cyan" : undefined}
                color={isActive ? "black" : "white"}
                data-testid={`tab-${screen.id}`}
              >
                {isActive ? "▶ " : "  "}
                {shortcutNum}. {screen.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Divider */}
      <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true}>
        <Text />
      </Box>

      {/* Active Screen */}
      <Box flexDirection="column" flexGrow={1}>
        {children({ activeScreen })}
      </Box>
    </Box>
  );
}

/**
 * Get the screen definition by ID.
 */
export function getScreenById(id: ScreenId): Screen | undefined {
  return SCREENS.find((s) => s.id === id);
}

/**
 * Get the screen index by ID.
 */
export function getScreenIndex(id: ScreenId): number {
  return SCREENS.findIndex((s) => s.id === id);
}
