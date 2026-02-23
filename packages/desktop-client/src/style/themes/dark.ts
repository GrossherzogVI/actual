import * as colorPalette from '@desktop-client/style/palette';

export const pageBackground = 'var(--background)';
export const pageBackgroundModalActive = 'var(--card)';
export const pageBackgroundTopLeft = 'var(--background)';
export const pageBackgroundBottomRight = 'var(--secondary)';
export const pageBackgroundLineTop = 'var(--primary)';
export const pageBackgroundLineMid = 'var(--background)';
export const pageBackgroundLineBottom = 'var(--muted-foreground)';
export const pageText = 'var(--foreground)';
export const pageTextLight = 'var(--muted-foreground)';
export const pageTextSubdued = colorPalette.navy500;
export const pageTextDark = 'var(--foreground)';
export const pageTextPositive = 'var(--primary)';
export const pageTextLink = 'var(--primary)';
export const pageTextLinkLight = colorPalette.blue300;

export const cardBackground = 'var(--card)';
export const cardBorder = 'var(--primary)';
export const cardShadow = colorPalette.navy700;

export const tableBackground = 'var(--card)';
export const tableRowBackgroundHover = 'var(--accent)';
export const tableText = 'var(--card-foreground)';
export const tableTextLight = tableText;
export const tableTextSubdued = colorPalette.navy500;
export const tableTextSelected = 'var(--accent-foreground)';
export const tableTextHover = 'var(--muted-foreground)';
export const tableTextInactive = colorPalette.navy500;
export const tableHeaderText = 'var(--muted-foreground)';
export const tableHeaderBackground = 'var(--secondary)';
export const tableBorder = 'var(--border)';
export const tableBorderSelected = 'var(--primary)';
export const tableBorderHover = 'var(--ring)';
export const tableBorderSeparator = colorPalette.navy400;
export const tableRowBackgroundHighlight = 'var(--accent)';
export const tableRowBackgroundHighlightText = 'var(--accent-foreground)';
export const tableRowHeaderBackground = 'var(--secondary)';
export const tableRowHeaderText = 'var(--foreground)';

export const numberPositive = colorPalette.green300;
export const numberNegative = colorPalette.red200;
export const numberNeutral = colorPalette.navy500;
export const budgetNumberNegative = numberNegative;
export const budgetNumberZero = tableTextSubdued;
export const budgetNumberNeutral = tableText;
export const budgetNumberPositive = budgetNumberNeutral;
export const templateNumberFunded = numberPositive;
export const templateNumberUnderFunded = colorPalette.orange300;
export const toBudgetPositive = numberPositive;
export const toBudgetZero = numberPositive;
export const toBudgetNegative = budgetNumberNegative;

export const sidebarBackground = 'var(--sidebar)';
export const sidebarItemBackgroundPending = colorPalette.orange200;
export const sidebarItemBackgroundPositive = colorPalette.green500;
export const sidebarItemBackgroundFailed = colorPalette.red300;
export const sidebarItemAccentSelected = 'var(--sidebar-primary)';
export const sidebarItemBackgroundHover = 'var(--sidebar-accent)';
export const sidebarItemText = 'var(--sidebar-foreground)';
export const sidebarItemTextSelected = 'var(--sidebar-primary)';
export const sidebarBudgetName = 'var(--sidebar-foreground)';

export const menuBackground = 'var(--popover)';
export const menuItemBackground = 'var(--popover)';
export const menuItemBackgroundHover = 'var(--accent)';
export const menuItemText = 'var(--popover-foreground)';
export const menuItemTextHover = 'var(--foreground)';
export const menuItemTextSelected = 'var(--primary)';
export const menuItemTextHeader = 'var(--muted-foreground)';
export const menuBorder = 'var(--border)';
export const menuBorderHover = 'var(--primary)';
export const menuKeybindingText = 'var(--muted-foreground)';
export const menuAutoCompleteBackground = colorPalette.navy900;
export const menuAutoCompleteBackgroundHover = colorPalette.navy600;
export const menuAutoCompleteText = colorPalette.navy200;
export const menuAutoCompleteTextHeader = colorPalette.blue200;
export const menuAutoCompleteItemText = menuItemText;

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
export const mobileAccountShadow = cardShadow;
export const mobileAccountText = colorPalette.blue800;
export const mobileTransactionSelected = 'var(--primary)';

// Mobile view themes (for the top bar)
export const mobileViewTheme = mobileHeaderBackground;
export const mobileConfigServerViewTheme = 'var(--primary)';

export const markdownNormal = 'var(--accent)';
export const markdownDark = 'var(--primary)';
export const markdownLight = 'var(--secondary)';

// Button
export const buttonMenuText = 'var(--muted-foreground)';
export const buttonMenuTextHover = buttonMenuText;
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
export const buttonPrimaryBackgroundHover = colorPalette.blue300;
export const buttonPrimaryBorder = buttonPrimaryBackground;
export const buttonPrimaryShadow = 'rgba(0, 0, 0, 0.6)';
export const buttonPrimaryDisabledText = colorPalette.navy700;
export const buttonPrimaryDisabledBackground = colorPalette.navy400;
export const buttonPrimaryDisabledBorder = buttonPrimaryDisabledBackground;

export const buttonNormalText = 'var(--foreground)';
export const buttonNormalTextHover = 'var(--foreground)';
export const buttonNormalBackground = 'var(--card)';
export const buttonNormalBackgroundHover = 'var(--accent)';
export const buttonNormalBorder = 'var(--border)';
export const buttonNormalShadow = 'rgba(0, 0, 0, 0.4)';
export const buttonNormalSelectedText = 'var(--primary-foreground)';
export const buttonNormalSelectedBackground = 'var(--primary)';
export const buttonNormalDisabledText = colorPalette.navy500;
export const buttonNormalDisabledBackground = 'var(--card)';
export const buttonNormalDisabledBorder = colorPalette.navy500;

export const calendarText = colorPalette.navy50;
export const calendarBackground = colorPalette.navy900;
export const calendarItemText = colorPalette.navy150;
export const calendarItemBackground = colorPalette.navy800;
export const calendarSelectedBackground = buttonNormalSelectedBackground;

export const buttonBareText = buttonNormalText;
export const buttonBareTextHover = buttonNormalText;
export const buttonBareBackground = 'transparent';
export const buttonBareBackgroundHover = 'rgba(200, 200, 200, .3)';
export const buttonBareBackgroundActive = 'rgba(200, 200, 200, .5)';
export const buttonBareDisabledText = buttonNormalDisabledText;
export const buttonBareDisabledBackground = buttonBareBackground;

export const noticeBackground = colorPalette.green800;
export const noticeBackgroundLight = colorPalette.green900;
export const noticeBackgroundDark = colorPalette.green500;
export const noticeText = colorPalette.green300;
export const noticeTextLight = colorPalette.green500;
export const noticeTextDark = colorPalette.green150;
export const noticeTextMenu = colorPalette.green500;
export const noticeBorder = colorPalette.green800;
export const warningBackground = colorPalette.orange800;
export const warningText = colorPalette.orange300;
export const warningTextLight = colorPalette.orange500;
export const warningTextDark = colorPalette.orange100;
export const warningBorder = colorPalette.orange500;
export const errorBackground = colorPalette.red800;
export const errorText = colorPalette.red200;
export const errorTextDark = colorPalette.red150;
export const errorTextDarker = errorTextDark;
export const errorTextMenu = colorPalette.red200;
export const errorBorder = colorPalette.red500;
export const upcomingBackground = 'var(--accent)';
export const upcomingText = 'var(--primary)';
export const upcomingBorder = tableBorder;

export const formLabelText = 'var(--primary)';
export const formLabelBackground = colorPalette.blue900;
export const formInputBackground = 'var(--card)';
export const formInputBackgroundSelected = 'var(--secondary)';
export const formInputBackgroundSelection = 'var(--primary)';
export const formInputBorder = 'var(--input)';
export const formInputTextReadOnlySelection = 'var(--card)';
export const formInputBorderSelected = 'var(--ring)';
export const formInputText = 'var(--foreground)';
export const formInputTextSelected = colorPalette.black;
export const formInputTextPlaceholder = 'var(--muted-foreground)';
export const formInputTextPlaceholderSelected = colorPalette.navy100;
export const formInputTextSelection = 'var(--secondary)';
export const formInputShadowSelected = 'var(--ring)';
export const formInputTextHighlight = colorPalette.blue400;
export const checkboxText = tableText;
export const checkboxBackgroundSelected = 'var(--primary)';
export const checkboxBorderSelected = 'var(--primary)';
export const checkboxShadowSelected = 'var(--ring)';
export const checkboxToggleBackground = colorPalette.gray700;
export const checkboxToggleBackgroundSelected = 'var(--primary)';
export const checkboxToggleDisabled = colorPalette.gray400;

export const pillBackground = 'var(--secondary)';
export const pillBackgroundLight = 'var(--background)';
export const pillText = 'var(--secondary-foreground)';
export const pillTextHighlighted = 'var(--primary)';
export const pillBorder = 'var(--border)';
export const pillBorderDark = pillBorder;
export const pillBackgroundSelected = 'var(--primary)';
export const pillTextSelected = 'var(--primary-foreground)';
export const pillBorderSelected = 'var(--primary)';
export const pillTextSubdued = colorPalette.navy500;

export const reportsRed = colorPalette.red300;
export const reportsBlue = colorPalette.blue400;
export const reportsGreen = colorPalette.green400;
export const reportsGray = colorPalette.gray400;
export const reportsLabel = 'var(--foreground)';
export const reportsInnerLabel = colorPalette.navy800;
export const reportsNumberPositive = numberPositive;
export const reportsNumberNegative = numberNegative;
export const reportsNumberNeutral = numberNeutral;
export const reportsChartFill = reportsNumberPositive;

export const noteTagBackground = 'var(--accent)';
export const noteTagBackgroundHover = 'var(--secondary)';
export const noteTagDefault = 'var(--accent)';
export const noteTagText = 'var(--foreground)';

export const budgetOtherMonth = 'var(--background)';
export const budgetCurrentMonth = tableBackground;
export const budgetHeaderOtherMonth = 'var(--secondary)';
export const budgetHeaderCurrentMonth = tableHeaderBackground;

export const floatingActionBarBackground = 'var(--primary)';
export const floatingActionBarBorder = floatingActionBarBackground;
export const floatingActionBarText = 'var(--primary-foreground)';

export const tooltipText = 'var(--popover-foreground)';
export const tooltipBackground = 'var(--popover)';
export const tooltipBorder = 'var(--border)';

export const calendarCellBackground = 'var(--background)';

export const overlayBackground = 'rgba(0, 0, 0, 0.3)';

// Status / health colors (same in light + dark)
export const healthGreen = '#22C55E';
export const healthYellow = '#EAB308';
export const healthRed = '#EF4444';

// Elevated card / badge / toast
export const cardBackgroundElevated = 'var(--secondary)';
export const cardBorderSubtle = 'var(--border)';
export const badgeBackground = 'var(--primary)';
export const badgeText = 'var(--primary-foreground)';
export const toastBackground = colorPalette.navy900;
export const toastText = colorPalette.navy100;

// Skeleton loading
export const skeletonBase = 'var(--secondary)';
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
