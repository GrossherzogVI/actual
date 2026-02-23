import * as colorPalette from '@desktop-client/style/palette';

export const pageBackground = 'var(--background)';
export const pageBackgroundModalActive = 'var(--muted)';
export const pageBackgroundTopLeft = 'var(--background)';
export const pageBackgroundBottomRight = 'var(--secondary)';
export const pageBackgroundLineTop = 'var(--card)';
export const pageBackgroundLineMid = 'var(--background)';
export const pageBackgroundLineBottom = 'var(--secondary)';
export const pageText = 'var(--foreground)';
export const pageTextLight = 'var(--muted-foreground)';
export const pageTextSubdued = colorPalette.navy300;
export const pageTextDark = 'var(--secondary-foreground)';
export const pageTextPositive = 'var(--primary)';
export const pageTextLink = 'var(--primary)';
export const pageTextLinkLight = colorPalette.blue300;

export const cardBackground = 'var(--card)';
export const cardBorder = 'var(--primary)';
export const cardShadow = colorPalette.navy700;

export const tableBackground = 'var(--card)';
export const tableRowBackgroundHover = 'var(--accent)';
export const tableText = 'var(--card-foreground)';
export const tableTextLight = 'var(--muted-foreground)';
export const tableTextSubdued = colorPalette.navy100;
export const tableTextSelected = 'var(--accent-foreground)';
export const tableTextHover = 'var(--foreground)';
export const tableTextInactive = 'var(--muted-foreground)';
export const tableHeaderText = 'var(--muted-foreground)';
export const tableHeaderBackground = 'var(--card)';
export const tableBorder = 'var(--border)';
export const tableBorderSelected = 'var(--primary)';
export const tableBorderHover = 'var(--ring)';
export const tableBorderSeparator = colorPalette.navy400;
export const tableRowBackgroundHighlight = 'var(--accent)';
export const tableRowBackgroundHighlightText = 'var(--accent-foreground)';
export const tableRowHeaderBackground = 'var(--muted)';
export const tableRowHeaderText = 'var(--foreground)';

export const numberPositive = colorPalette.green700;
export const numberNegative = colorPalette.red500;
export const numberNeutral = colorPalette.navy100;
export const budgetNumberNegative = numberNegative;
export const budgetNumberZero = tableTextSubdued;
export const budgetNumberNeutral = tableText;
export const budgetNumberPositive = budgetNumberNeutral;
export const templateNumberFunded = numberPositive;
export const templateNumberUnderFunded = colorPalette.orange700;
export const toBudgetPositive = numberPositive;
export const toBudgetZero = numberPositive;
export const toBudgetNegative = budgetNumberNegative;

export const sidebarBackground = 'var(--sidebar)';
export const sidebarItemBackgroundPending = colorPalette.orange200;
export const sidebarItemBackgroundPositive = colorPalette.green500;
export const sidebarItemBackgroundFailed = colorPalette.red300;
export const sidebarItemBackgroundHover = 'var(--sidebar-accent)';
export const sidebarItemAccentSelected = 'var(--sidebar-primary)';
export const sidebarItemText = 'var(--sidebar-foreground)';
export const sidebarItemTextSelected = 'var(--sidebar-primary)';
export const sidebarBudgetName = 'var(--sidebar-foreground)';

export const menuBackground = 'var(--popover)';
export const menuItemBackground = 'var(--popover)';
export const menuItemBackgroundHover = 'var(--accent)';
export const menuItemText = 'var(--popover-foreground)';
export const menuItemTextHover = menuItemText;
export const menuItemTextSelected = 'var(--primary)';
export const menuItemTextHeader = 'var(--muted-foreground)';
export const menuBorder = 'var(--border)';
export const menuBorderHover = 'var(--ring)';
export const menuKeybindingText = 'var(--muted-foreground)';
export const menuAutoCompleteBackground = colorPalette.navy900;
export const menuAutoCompleteBackgroundHover = colorPalette.navy600;
export const menuAutoCompleteText = colorPalette.white;
export const menuAutoCompleteTextHover = colorPalette.green150;
export const menuAutoCompleteTextHeader = colorPalette.orange150;
export const menuAutoCompleteItemTextHover = menuAutoCompleteText;
export const menuAutoCompleteItemText = menuAutoCompleteText;

export const modalBackground = 'var(--card)';
export const modalBorder = 'var(--border)';
export const mobileHeaderBackground = 'var(--primary)';
export const mobileHeaderText = 'var(--primary-foreground)';
export const mobileHeaderTextSubdued = colorPalette.gray200;
export const mobileHeaderTextHover = 'rgba(200, 200, 200, .15)';
export const mobilePageBackground = 'var(--background)';
export const mobileNavBackground = 'var(--card)';
export const mobileNavItem = 'var(--muted-foreground)';
export const mobileNavItemSelected = 'var(--primary)';
export const mobileAccountShadow = colorPalette.navy300;
export const mobileAccountText = 'var(--primary)';
export const mobileTransactionSelected = 'var(--primary)';

// Mobile view themes (for the top bar)
export const mobileViewTheme = mobileHeaderBackground;
export const mobileConfigServerViewTheme = 'var(--primary)';

export const markdownNormal = 'var(--accent)';
export const markdownDark = 'var(--primary)';
export const markdownLight = 'var(--secondary)';

// Button
export const buttonMenuText = colorPalette.navy100;
export const buttonMenuTextHover = colorPalette.navy50;
export const buttonMenuBackground = 'transparent';
export const buttonMenuBackgroundHover = 'rgba(200, 200, 200, .25)';
export const buttonMenuBorder = colorPalette.navy500;
export const buttonMenuSelectedText = colorPalette.green800;
export const buttonMenuSelectedTextHover = colorPalette.orange800;
export const buttonMenuSelectedBackground = colorPalette.orange200;
export const buttonMenuSelectedBackgroundHover = colorPalette.orange300;
export const buttonMenuSelectedBorder = buttonMenuSelectedBackground;

export const buttonPrimaryText = 'var(--primary-foreground)';
export const buttonPrimaryTextHover = buttonPrimaryText;
export const buttonPrimaryBackground = 'var(--primary)';
export const buttonPrimaryBackgroundHover = colorPalette.blue400;
export const buttonPrimaryBorder = buttonPrimaryBackground;
export const buttonPrimaryShadow = 'rgba(0, 0, 0, 0.3)';
export const buttonPrimaryDisabledText = colorPalette.white;
export const buttonPrimaryDisabledBackground = colorPalette.navy300;
export const buttonPrimaryDisabledBorder = buttonPrimaryDisabledBackground;

export const buttonNormalText = 'var(--foreground)';
export const buttonNormalTextHover = buttonNormalText;
export const buttonNormalBackground = 'var(--card)';
export const buttonNormalBackgroundHover = buttonNormalBackground;
export const buttonNormalBorder = 'var(--border)';
export const buttonNormalShadow = 'rgba(0, 0, 0, 0.2)';
export const buttonNormalSelectedText = 'var(--primary-foreground)';
export const buttonNormalSelectedBackground = 'var(--primary)';
export const buttonNormalDisabledText = colorPalette.navy300;
export const buttonNormalDisabledBackground = buttonNormalBackground;
export const buttonNormalDisabledBorder = buttonNormalBorder;

export const calendarText = colorPalette.navy50;
export const calendarBackground = colorPalette.navy900;
export const calendarItemText = colorPalette.navy150;
export const calendarItemBackground = colorPalette.navy800;
export const calendarSelectedBackground = colorPalette.navy500;

export const buttonBareText = buttonNormalText;
export const buttonBareTextHover = buttonNormalText;
export const buttonBareBackground = 'transparent';
export const buttonBareBackgroundHover = 'rgba(100, 100, 100, .15)';
export const buttonBareBackgroundActive = 'rgba(100, 100, 100, .25)';
export const buttonBareDisabledText = buttonNormalDisabledText;
export const buttonBareDisabledBackground = buttonBareBackground;

export const noticeBackground = colorPalette.green150;
export const noticeBackgroundLight = colorPalette.green100;
export const noticeBackgroundDark = colorPalette.green500;
export const noticeText = colorPalette.green700;
export const noticeTextLight = colorPalette.green500;
export const noticeTextDark = colorPalette.green900;
export const noticeTextMenu = colorPalette.green200;
export const noticeBorder = colorPalette.green500;
export const warningBackground = colorPalette.orange200;
export const warningText = colorPalette.orange700;
export const warningTextLight = colorPalette.orange500;
export const warningTextDark = colorPalette.orange900;
export const warningBorder = colorPalette.orange500;
export const errorBackground = colorPalette.red100;
export const errorText = colorPalette.red500;
export const errorTextDark = colorPalette.red700;
export const errorTextDarker = colorPalette.red900;
export const errorTextMenu = colorPalette.red200;
export const errorBorder = colorPalette.red500;
export const upcomingBackground = 'var(--accent)';
export const upcomingText = 'var(--primary)';
export const upcomingBorder = 'var(--primary)';

export const formLabelText = 'var(--primary)';
export const formLabelBackground = colorPalette.blue200;
export const formInputBackground = 'var(--card)';
export const formInputBackgroundSelected = 'var(--card)';
export const formInputBackgroundSelection = 'var(--primary)';
export const formInputBorder = 'var(--input)';
export const formInputTextReadOnlySelection = 'var(--muted)';
export const formInputBorderSelected = 'var(--ring)';
export const formInputText = 'var(--foreground)';
export const formInputTextSelected = 'var(--primary-foreground)';
export const formInputTextPlaceholder = 'var(--muted-foreground)';
export const formInputTextPlaceholderSelected = colorPalette.navy200;
export const formInputTextSelection = 'var(--accent)';
export const formInputShadowSelected = 'var(--ring)';
export const formInputTextHighlight = colorPalette.blue200;
export const checkboxText = tableBackground;
export const checkboxBackgroundSelected = 'var(--primary)';
export const checkboxBorderSelected = 'var(--primary)';
export const checkboxShadowSelected = 'var(--ring)';
export const checkboxToggleBackground = colorPalette.gray400;
export const checkboxToggleBackgroundSelected = 'var(--primary)';
export const checkboxToggleDisabled = colorPalette.gray200;

export const pillBackground = 'var(--secondary)';
export const pillBackgroundLight = 'var(--accent)';
export const pillText = 'var(--secondary-foreground)';
export const pillTextHighlighted = 'var(--primary)';
export const pillBorder = 'var(--border)';
export const pillBorderDark = colorPalette.navy300;
export const pillBackgroundSelected = 'var(--accent)';
export const pillTextSelected = 'var(--primary)';
export const pillBorderSelected = 'var(--primary)';
export const pillTextSubdued = colorPalette.navy200;

export const reportsRed = colorPalette.red300;
export const reportsBlue = colorPalette.blue400;
export const reportsGreen = colorPalette.green400;
export const reportsGray = colorPalette.gray400;
export const reportsLabel = 'var(--foreground)';
export const reportsInnerLabel = 'var(--secondary-foreground)';
export const reportsNumberPositive = numberPositive;
export const reportsNumberNegative = numberNegative;
export const reportsNumberNeutral = numberNeutral;
export const reportsChartFill = reportsNumberPositive;

export const noteTagBackground = 'var(--accent)';
export const noteTagBackgroundHover = 'var(--secondary)';
export const noteTagDefault = 'var(--accent)';
export const noteTagText = 'var(--foreground)';

export const budgetCurrentMonth = tableBackground;
export const budgetOtherMonth = 'var(--muted)';
export const budgetHeaderCurrentMonth = budgetOtherMonth;
export const budgetHeaderOtherMonth = colorPalette.gray80;

export const floatingActionBarBackground = 'var(--primary)';
export const floatingActionBarBorder = floatingActionBarBackground;
export const floatingActionBarText = 'var(--primary-foreground)';

export const tooltipText = 'var(--popover-foreground)';
export const tooltipBackground = 'var(--popover)';
export const tooltipBorder = 'var(--border)';

export const calendarCellBackground = 'var(--muted)';

export const overlayBackground = 'rgba(0, 0, 0, 0.3)';

// Status / health colors (same in light + dark)
export const healthGreen = '#22C55E';
export const healthYellow = '#EAB308';
export const healthRed = '#EF4444';

// Elevated card / badge / toast
export const cardBackgroundElevated = 'var(--card)';
export const cardBorderSubtle = 'var(--border)';
export const badgeBackground = 'var(--primary)';
export const badgeText = 'var(--primary-foreground)';
export const toastBackground = colorPalette.navy900;
export const toastText = colorPalette.navy50;

// Skeleton loading
export const skeletonBase = 'var(--muted)';
export const skeletonHighlight = 'var(--accent)';

// Category colors — brand colors, same in both themes
export const categoryWohnen = '#4A90D9';
export const categoryMobilitaet = '#F5A623';
export const categoryLebensmittel = '#7ED321';
export const categoryFreizeit = '#BD10E0';
export const categoryVersicherungen = '#9013FE';
export const categoryFinanzen = '#417505';
export const categoryGesundheit = '#D0021B';
export const categoryEinkaeufe = '#F8E71C';
export const categoryBildung = '#50E3C2';
export const categoryKinder = '#FF6B6B';
export const categorySonstiges = '#9B9B9B';
export const categoryEinkommen = '#7ED321';

// Chart colors - Qualitative scale (9 colors)
export const chartQual1 = colorPalette.chartQual1;
export const chartQual2 = colorPalette.chartQual2;
export const chartQual3 = colorPalette.chartQual3;
export const chartQual4 = colorPalette.chartQual4;
export const chartQual5 = colorPalette.chartQual5;
export const chartQual6 = colorPalette.chartQual6;
export const chartQual7 = colorPalette.chartQual7;
export const chartQual8 = colorPalette.chartQual8;
export const chartQual9 = colorPalette.chartQual9;
