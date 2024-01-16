import type {StackScreenProps} from '@react-navigation/stack';
import {format} from 'date-fns';
import Str from 'expensify-common/lib/str';
import Onyx from 'react-native-onyx';
import type {OnyxCollection, OnyxEntry, OnyxUpdate} from 'react-native-onyx';
import OnyxUtils from 'react-native-onyx/lib/utils';
import type {ValueOf} from 'type-fest';
import ReceiptGeneric from '@assets/images/receipt-generic.png';
import * as API from '@libs/API';
import * as CurrencyUtils from '@libs/CurrencyUtils';
import DateUtils from '@libs/DateUtils';
import * as ErrorUtils from '@libs/ErrorUtils';
import * as IOUUtils from '@libs/IOUUtils';
import * as LocalePhoneNumber from '@libs/LocalePhoneNumber';
import * as Localize from '@libs/Localize';
import Navigation from '@libs/Navigation/Navigation';
import * as NumberUtils from '@libs/NumberUtils';
import * as OptionsListUtils from '@libs/OptionsListUtils';
import Permissions from '@libs/Permissions';
import * as PolicyUtils from '@libs/PolicyUtils';
import * as ReportActionsUtils from '@libs/ReportActionsUtils';
import * as ReportUtils from '@libs/ReportUtils';
import type {OptimisticChatReport, OptimisticCreatedReportAction, OptimisticIOUReportAction, TransactionDetails} from '@libs/ReportUtils';
import * as TransactionUtils from '@libs/TransactionUtils';
import * as UserUtils from '@libs/UserUtils';
import ViolationsUtils from '@libs/ViolationsUtils';
import type {MoneyRequestNavigatorParamList} from '@navigation/types';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';
import type * as OnyxTypes from '@src/types/onyx';
import type {Participant, Split} from '@src/types/onyx/IOU';
import type {Errors, ErrorsObject} from '@src/types/onyx/OnyxCommon';
import type ReportAction from '@src/types/onyx/ReportAction';
import type {OnyxData} from '@src/types/onyx/Request';
import type {Comment, Receipt, TaxRate, TransactionChanges, WaypointCollection} from '@src/types/onyx/Transaction';
import type DeepValueOf from '@src/types/utils/DeepValueOf';
import type {EmptyObject} from '@src/types/utils/EmptyObject';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import * as Policy from './Policy';
import * as Report from './Report';

// TODO: Remove this once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
type OptimisticPolicyRecentlyUsedCategories = string[];

// TODO: Remove this once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
type OptimisticPolicyRecentlyUsedTags = Record<string, string[]>;

type MoneyRequestRoute = StackScreenProps<
    MoneyRequestNavigatorParamList,
    typeof SCREENS.MONEY_REQUEST.CATEGORY | typeof SCREENS.MONEY_REQUEST.TAG | typeof SCREENS.MONEY_REQUEST.CONFIRMATION
>['route'];

type IOURequestType = ValueOf<typeof CONST.IOU.REQUEST_TYPE>;

type PaymentMethodType = DeepValueOf<typeof CONST.IOU.PAYMENT_TYPE>;

type OneOnOneIOUReport = OnyxTypes.Report | undefined | null;

type MoneyRequestInformation = {
    payerAccountID: number;
    payerEmail: string;
    iouReport: OnyxTypes.Report;
    chatReport: OnyxTypes.Report;
    transaction: OnyxTypes.Transaction;
    iouAction: OptimisticIOUReportAction;
    createdChatReportActionID: string;
    createdIOUReportActionID: string;
    reportPreviewAction: OnyxTypes.ReportAction;
    onyxData: OnyxData;
};

type SplitData = {
    chatReportID: string;
    transactionID: string;
    reportActionID: string;
    policyID?: string;
    createdReportActionID?: string;
};

type SplitsAndOnyxData = {
    splitData: SplitData;
    splits: Split[];
    onyxData: OnyxData;
};

type UpdateMoneyRequestParams = Partial<TransactionDetails> & {
    reportID?: string;
    transactionID: string;
    reportActionID?: string;
};

type UpdateMoneyRequestData = {
    params: UpdateMoneyRequestParams;
    onyxData: OnyxData;
};

type PayMoneyRequestParams = {
    iouReportID: string;
    chatReportID: string;
    reportActionID: string;
    paymentMethodType: PaymentMethodType;
};

type PayMoneyRequestData = {
    params: PayMoneyRequestParams;
    optimisticData: OnyxUpdate[];
    successData: OnyxUpdate[];
    failureData: OnyxUpdate[];
};

type SendMoneyParams = {
    iouReportID: string;
    chatReportID: string;
    reportActionID: string;
    paymentMethodType: PaymentMethodType;
    transactionID: string;
    newIOUReportDetails: string;
    createdReportActionID: string;
    reportPreviewReportActionID: string;
};

type SendMoneyParamsData = {
    params: SendMoneyParams;
    optimisticData: OnyxUpdate[];
    successData: OnyxUpdate[];
    failureData: OnyxUpdate[];
};

let betas: OnyxTypes.Beta[] = [];
Onyx.connect({
    key: ONYXKEYS.BETAS,
    callback: (val) => (betas = val ?? []),
});

let allPersonalDetails: OnyxTypes.PersonalDetailsList = {};
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (val) => {
        allPersonalDetails = val ?? {};
    },
});

let allReports: OnyxCollection<OnyxTypes.Report> = null;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.REPORT,
    waitForCollectionCallback: true,
    callback: (val) => (allReports = val),
});

let allTransactions: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION,
    waitForCollectionCallback: true,
    callback: (val) => {
        if (!val) {
            allTransactions = {};
            return;
        }

        allTransactions = val;
    },
});

let allTransactionDrafts: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (val) => {
        allTransactionDrafts = val ?? {};
    },
});

let allTransactionViolations: NonNullable<OnyxCollection<OnyxTypes.TransactionViolations>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS,
    waitForCollectionCallback: true,
    callback: (val) => {
        if (!val) {
            allTransactionViolations = {};
            return;
        }

        allTransactionViolations = val;
    },
});

let allDraftSplitTransactions: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (val) => {
        allDraftSplitTransactions = val ?? {};
    },
});

let allNextSteps: NonNullable<OnyxCollection<OnyxTypes.ReportNextStep>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.NEXT_STEP,
    waitForCollectionCallback: true,
    callback: (val) => {
        allNextSteps = val ?? {};
    },
});

let userAccountID = -1;
let currentUserEmail = '';
Onyx.connect({
    key: ONYXKEYS.SESSION,
    callback: (val) => {
        currentUserEmail = val?.email ?? '';
        userAccountID = val?.accountID ?? -1;
    },
});

let currentUserPersonalDetails: OnyxTypes.PersonalDetails | EmptyObject = {};
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (val) => {
        currentUserPersonalDetails = val?.[userAccountID] ?? {};
    },
});

let currentDate: OnyxEntry<string> = '';
Onyx.connect({
    key: ONYXKEYS.CURRENT_DATE,
    callback: (val) => {
        currentDate = val;
    },
});

/**
 * Initialize money request info
 * @param reportID to attach the transaction to
 * @param iouRequestType one of manual/scan/distance
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
function startMoneyRequest_temporaryForRefactor(reportID: string, isFromGlobalCreate: boolean, iouRequestType: IOURequestType = CONST.IOU.REQUEST_TYPE.MANUAL) {
    // Generate a brand new transactionID
    const newTransactionID = CONST.IOU.OPTIMISTIC_TRANSACTION_ID;
    // Disabling this line since currentDate can be an empty string
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const created = currentDate || format(new Date(), 'yyyy-MM-dd');
    const comment: Comment = {};

    // Add initial empty waypoints when starting a distance request
    if (iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE) {
        comment.waypoints = {
            waypoint0: {},
            waypoint1: {},
        };
    }

    // Store the transaction in Onyx and mark it as not saved so it can be cleaned up later
    // Use set() here so that there is no way that data will be leaked between objects when it gets reset
    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${newTransactionID}`, {
        amount: 0,
        comment,
        created,
        currency: currentUserPersonalDetails.localCurrencyCode ?? CONST.CURRENCY.USD,
        iouRequestType,
        reportID,
        transactionID: newTransactionID,
        isFromGlobalCreate,
        merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
    });
}

function clearMoneyRequest(transactionID: string) {
    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, null);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestAmount_temporaryForRefactor(transactionID: string, amount: number, currency: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {amount, currency});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestCreated_temporaryForRefactor(transactionID: string, created: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {created});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestCurrency_temporaryForRefactor(transactionID: string, currency: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {currency});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestDescription_temporaryForRefactor(transactionID: string, comment: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {comment: {comment: comment.trim()}});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestMerchant_temporaryForRefactor(transactionID: string, merchant: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {merchant: merchant.trim()});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestCategory_temporaryForRefactor(transactionID: string, category: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {category});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function resetMoneyRequestCategory_temporaryForRefactor(transactionID: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {category: null});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestTag_temporaryForRefactor(transactionID: string, tag: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {tag});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function resetMoneyRequestTag_temporaryForRefactor(transactionID: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {tag: null});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestBillable_temporaryForRefactor(transactionID: string, billable: boolean) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {billable});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function setMoneyRequestParticipants_temporaryForRefactor(transactionID: string, participants: Participant[]) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {participants});
}

function setMoneyRequestReceipt(transactionID: string, source: string, filename: string, isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        receipt: {source},
        filename,
    });
}

/**
 * Reset money request info from the store with its initial value
 */
function resetMoneyRequestInfo(id = '') {
    // Disabling this line since currentDate can be an empty string
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const created = currentDate || format(new Date(), CONST.DATE.FNS_FORMAT_STRING);
    Onyx.merge(ONYXKEYS.IOU, {
        id,
        amount: 0,
        currency: currentUserPersonalDetails.localCurrencyCode ?? CONST.CURRENCY.USD,
        comment: '',
        participants: [],
        merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
        category: '',
        tag: '',
        created,
        receiptPath: '',
        receiptFilename: '',
        transactionID: '',
        billable: null,
        isSplitRequest: false,
    });
}

/**
 *  Helper function to get the receipt error for money requests, or the generic error if there's no receipt
 */
function getReceiptError(receipt?: Receipt, filename?: string, isScanRequest = true): Errors | ErrorsObject {
    return isEmptyObject(receipt) || !isScanRequest
        ? ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage')
        : ErrorUtils.getMicroSecondOnyxErrorObject({error: CONST.IOU.RECEIPT_ERROR, source: receipt.source ?? '', filename: filename ?? ''});
}

/** Builds the Onyx data for a money request */
function buildOnyxDataForMoneyRequest(
    chatReport: OnyxEntry<OnyxTypes.Report>,
    iouReport: OnyxTypes.Report,
    transaction: OnyxTypes.Transaction,
    chatCreatedAction: OptimisticCreatedReportAction,
    iouCreatedAction: OptimisticCreatedReportAction,
    iouAction: OptimisticIOUReportAction,
    optimisticPersonalDetailListAction: OnyxTypes.PersonalDetailsList,
    reportPreviewAction: ReportAction,
    optimisticPolicyRecentlyUsedCategories: OptimisticPolicyRecentlyUsedCategories,
    optimisticPolicyRecentlyUsedTags: OptimisticPolicyRecentlyUsedTags,
    isNewChatReport: boolean,
    isNewIOUReport: boolean,
    policy?: OnyxTypes.Policy | EmptyObject,
    policyTags?: OnyxTypes.PolicyTags,
    policyCategories?: OnyxTypes.PolicyCategories,
    hasOutstandingChildRequest = false,
): [OnyxUpdate[], OnyxUpdate[], OnyxUpdate[]] {
    const isScanRequest = TransactionUtils.isScanRequest(transaction);
    const optimisticData: OnyxUpdate[] = [];

    if (chatReport) {
        optimisticData.push({
            // Use SET for new reports because it doesn't exist yet, is faster and we need the data to be available when we navigate to the chat page
            onyxMethod: isNewChatReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                ...chatReport,
                lastReadTime: DateUtils.getDBTime(),
                lastMessageTranslationKey: '',
                iouReportID: iouReport.reportID,
                hasOutstandingChildRequest,
                ...(isNewChatReport ? {pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD}} : {}),
            },
        });
    }

    optimisticData.push(
        {
            onyxMethod: isNewIOUReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                ...iouReport,
                lastMessageText: iouAction.message?.[0].text,
                lastMessageHtml: iouAction.message?.[0].html,
                pendingFields: {
                    ...(isNewIOUReport ? {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : {preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: transaction,
        },
        isNewChatReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                  value: {
                      [chatCreatedAction.reportActionID]: chatCreatedAction,
                      [reportPreviewAction.reportActionID]: reportPreviewAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                  value: {
                      [reportPreviewAction.reportActionID]: reportPreviewAction,
                  },
              },
        isNewIOUReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                  value: {
                      [iouCreatedAction.reportActionID]: iouCreatedAction as OnyxTypes.ReportAction,
                      [iouAction.reportActionID]: iouAction as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                  value: {
                      [iouAction.reportActionID]: iouAction as OnyxTypes.ReportAction,
                  },
              },

        // Remove the temporary transaction used during the creation flow
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },
    );

    if (optimisticPolicyRecentlyUsedCategories.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport.policyID}`,
            value: optimisticPolicyRecentlyUsedCategories,
        });
    }

    if (Object.keys(optimisticPolicyRecentlyUsedTags).length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport.policyID}`,
            value: optimisticPolicyRecentlyUsedTags,
        });
    }

    if (optimisticPersonalDetailListAction && Object.keys(optimisticPersonalDetailListAction).length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: optimisticPersonalDetailListAction,
        });
    }

    const successData: OnyxUpdate[] = [];

    if (isNewChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                pendingFields: null,
                errorFields: null,
            },
        });
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                pendingAction: null,
                pendingFields: null,
            },
        },

        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                ...(isNewChatReport
                    ? {
                          [chatCreatedAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                ...(isNewIOUReport
                    ? {
                          [iouCreatedAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [iouAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        },
    );

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                iouReportID: chatReport?.iouReportID,
                lastReadTime: chatReport?.lastReadTime,
                pendingFields: null,
                ...(isNewChatReport
                    ? {
                          errorFields: {
                              createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                          },
                      }
                    : {}),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                pendingFields: null,
                errorFields: {
                    ...(isNewIOUReport ? {createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage')} : {}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                pendingAction: null,
                pendingFields: null,
            },
        },

        // Remove the temporary transaction used during the creation flow
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },

        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                ...(isNewChatReport
                    ? {
                          [chatCreatedAction.reportActionID]: {
                              // Disabling this line since transaction.filename can be an empty string
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              errors: getReceiptError(transaction?.receipt, transaction.filename || transaction.receipt?.filename, isScanRequest),
                          },
                          [reportPreviewAction.reportActionID]: {
                              errors: ErrorUtils.getMicroSecondOnyxError(null),
                          },
                      }
                    : {
                          [reportPreviewAction.reportActionID]: {
                              created: reportPreviewAction.created,
                              // Disabling this line since transaction.filename can be an empty string
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              errors: getReceiptError(transaction?.receipt, transaction.filename || transaction.receipt?.filename, isScanRequest),
                          },
                      }),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                ...(isNewIOUReport
                    ? {
                          [iouCreatedAction.reportActionID]: {
                              // Disabling this line since transaction.filename can be an empty string
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt?.filename, isScanRequest),
                          },
                          [iouAction.reportActionID]: {
                              errors: ErrorUtils.getMicroSecondOnyxError(null),
                          },
                      }
                    : {
                          [iouAction.reportActionID]: {
                              // Disabling this line since transaction.filename can be an empty string
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt?.filename, isScanRequest),
                          },
                      }),
            },
        },
    ];

    // Policy won't be set for P2P cases for which we don't need to compute violations
    if (!policy?.id) {
        return [optimisticData, successData, failureData];
    }

    const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(transaction, [], !!policy.requiresTag, policyTags ?? {}, !!policy.requiresCategory, policyCategories ?? {});

    if (violationsOnyxData) {
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
            value: [],
        });
    }

    return [optimisticData, successData, failureData];
}

/**
 * Gathers all the data needed to make a money request. It attempts to find existing reports, iouReports, and receipts. If it doesn't find them, then
 * it creates optimistic versions of them and uses those instead
 */
function getMoneyRequestInformation(
    report: OnyxEntry<OnyxTypes.Report> | EmptyObject,
    participant: Participant,
    comment: string,
    amount: number,
    currency: string,
    created: string,
    merchant: string,
    receipt: Receipt | undefined,
    existingTransactionID: string | undefined,
    category: string | undefined,
    tag: string | undefined,
    billable: boolean | undefined,
    policy: OnyxTypes.Policy | EmptyObject | undefined,
    policyTags: OnyxTypes.PolicyTags | undefined,
    policyCategories: OnyxTypes.PolicyCategories | undefined,
    payeeAccountID = userAccountID,
    payeeEmail = currentUserEmail,
): MoneyRequestInformation {
    const payerEmail = OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login ?? '');
    const payerAccountID = Number(participant.accountID);
    const isPolicyExpenseChat = participant.isPolicyExpenseChat;

    // STEP 1: Get existing chat report OR build a new optimistic one
    let isNewChatReport = false;
    let chatReport = !isEmptyObject(report) && report?.reportID ? report : null;

    // If this is a policyExpenseChat, the chatReport must exist and we can get it from Onyx.
    // report is null if the flow is initiated from the global create menu. However, participant always stores the reportID if it exists, which is the case for policyExpenseChats
    if (!chatReport && isPolicyExpenseChat) {
        chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.reportID}`] ?? null;
    }

    if (!chatReport) {
        chatReport = ReportUtils.getChatByParticipants([payerAccountID]);
    }

    // If we still don't have a report, it likely doens't exist and we need to build an optimistic one
    if (!chatReport) {
        isNewChatReport = true;
        chatReport = ReportUtils.buildOptimisticChatReport([payerAccountID]);
    }

    // STEP 2: Get existing IOU report and update its total OR build a new optimistic one
    const isNewIOUReport = !chatReport.iouReportID || ReportUtils.hasIOUWaitingOnCurrentUserBankAccount(chatReport);
    let iouReport = isNewIOUReport ? null : allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReport.iouReportID}`];

    // Check if the Scheduled Submit is enabled in case of expense report
    let needsToBeManuallySubmitted = false;
    let isFromPaidPolicy = false;
    if (isPolicyExpenseChat) {
        isFromPaidPolicy = PolicyUtils.isPaidGroupPolicy(policy ?? null);

        // If the scheduled submit is turned off on the policy, user needs to manually submit the report which is indicated by GBR in LHN
        needsToBeManuallySubmitted = isFromPaidPolicy && !policy?.isHarvestingEnabled;

        // If the linked expense report on paid policy is not draft, we need to create a new draft expense report
        if (iouReport && isFromPaidPolicy && !ReportUtils.isDraftExpenseReport(iouReport)) {
            iouReport = null;
        }
    }

    if (iouReport) {
        if (isPolicyExpenseChat) {
            iouReport = {...iouReport};
            if (iouReport?.currency === currency && typeof iouReport.total === 'number') {
                // Because of the Expense reports are stored as negative values, we substract the total from the amount
                iouReport.total -= amount;
            }
        } else {
            iouReport = IOUUtils.updateIOUOwnerAndTotal(iouReport, payeeAccountID, amount, currency);
        }
    } else {
        iouReport = isPolicyExpenseChat
            ? ReportUtils.buildOptimisticExpenseReport(chatReport.reportID, chatReport.policyID ?? '', payeeAccountID, amount, currency)
            : ReportUtils.buildOptimisticIOUReport(payeeAccountID, payerAccountID, amount, chatReport.reportID, currency);
    }

    // STEP 3: Build optimistic receipt and transaction
    const receiptObject: Receipt = {};
    let filename;
    if (receipt?.source) {
        receiptObject.source = receipt.source;
        receiptObject.state = receipt.state ?? CONST.IOU.RECEIPT_STATE.SCANREADY;
        filename = receipt.name;
    }
    let optimisticTransaction = TransactionUtils.buildOptimisticTransaction(
        ReportUtils.isExpenseReport(iouReport) ? -amount : amount,
        currency,
        iouReport.reportID,
        comment,
        created,
        '',
        '',
        merchant,
        receiptObject,
        filename,
        existingTransactionID,
        category,
        tag,
        billable,
    );

    // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
    const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, category) as OptimisticPolicyRecentlyUsedCategories;

    // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
    const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, tag) as OptimisticPolicyRecentlyUsedTags;

    // If there is an existing transaction (which is the case for distance requests), then the data from the existing transaction
    // needs to be manually merged into the optimistic transaction. This is because buildOnyxDataForMoneyRequest() uses `Onyx.set()` for the transaction
    // data. This is a big can of worms to change it to `Onyx.merge()` as explored in https://expensify.slack.com/archives/C05DWUDHVK7/p1692139468252109.
    // I want to clean this up at some point, but it's possible this will live in the code for a while so I've created https://github.com/Expensify/App/issues/25417
    // to remind me to do this.
    const existingTransaction = allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`];
    if (existingTransaction && existingTransaction.iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE) {
        optimisticTransaction = OnyxUtils.fastMerge(existingTransaction, optimisticTransaction);
    }

    // STEP 4: Build optimistic reportActions. We need:
    // 1. CREATED action for the chatReport
    // 2. CREATED action for the iouReport
    // 3. IOU action for the iouReport
    // 4. REPORTPREVIEW action for the chatReport
    // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
    const currentTime = DateUtils.getDBTime();
    const optimisticCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(payeeEmail);
    const optimisticCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(payeeEmail, DateUtils.subtractMillisecondsFromDateTime(currentTime, 1));
    const iouAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.CREATE,
        amount,
        currency,
        comment,
        [participant],
        optimisticTransaction.transactionID,
        undefined,
        iouReport.reportID,
        false,
        false,
        receiptObject,
        false,
        currentTime,
    );

    let reportPreviewAction = isNewIOUReport ? null : ReportActionsUtils.getReportPreviewAction(chatReport.reportID, iouReport.reportID);
    if (reportPreviewAction) {
        reportPreviewAction = ReportUtils.updateReportPreview(iouReport, reportPreviewAction, false, comment, optimisticTransaction);
    } else {
        reportPreviewAction = ReportUtils.buildOptimisticReportPreview(chatReport, iouReport, comment, optimisticTransaction);

        // Generated ReportPreview action is a parent report action of the iou report.
        // We are setting the iou report's parentReportActionID to display subtitle correctly in IOU page when offline.
        iouReport.parentReportActionID = reportPreviewAction.reportActionID;
    }

    const shouldCreateOptimisticPersonalDetails = isNewChatReport && !allPersonalDetails[payerAccountID];
    // Add optimistic personal details for participant
    const optimisticPersonalDetailListAction = shouldCreateOptimisticPersonalDetails
        ? {
              [payerAccountID]: {
                  accountID: payerAccountID,
                  avatar: UserUtils.getDefaultAvatarURL(payerAccountID),
                  // Disabling this line since participant.displayName can be an empty string
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || payerEmail),
                  login: participant.login,
                  isOptimisticPersonalDetail: true,
              },
          }
        : {};

    // The policy expense chat should have the GBR only when its a paid policy and the scheduled submit is turned off
    // so the employee has to submit to their manager manually.
    const hasOutstandingChildRequest = isPolicyExpenseChat && needsToBeManuallySubmitted;

    // STEP 5: Build Onyx Data
    const [optimisticData, successData, failureData] = buildOnyxDataForMoneyRequest(
        chatReport,
        iouReport,
        optimisticTransaction,
        optimisticCreatedActionForChat,
        optimisticCreatedActionForIOU,
        iouAction,
        optimisticPersonalDetailListAction,
        reportPreviewAction,
        optimisticPolicyRecentlyUsedCategories,
        optimisticPolicyRecentlyUsedTags,
        isNewChatReport,
        isNewIOUReport,
        policy,
        policyTags,
        policyCategories,
        hasOutstandingChildRequest,
    );

    return {
        payerAccountID,
        payerEmail,
        iouReport,
        chatReport,
        transaction: optimisticTransaction,
        iouAction,
        createdChatReportActionID: isNewChatReport ? optimisticCreatedActionForChat.reportActionID : '0',
        createdIOUReportActionID: isNewIOUReport ? optimisticCreatedActionForIOU.reportActionID : '0',
        reportPreviewAction,
        onyxData: {
            optimisticData,
            successData,
            failureData,
        },
    };
}

/** Requests money based on a distance (eg. mileage from a map) */
function createDistanceRequest(
    report: OnyxTypes.Report,
    participant: Participant,
    comment: string,
    created: string,
    category: string | undefined,
    tag: string | undefined,
    amount: number,
    currency: string,
    merchant: string,
    billable: boolean | undefined,
    validWaypoints: WaypointCollection,
    policy: OnyxTypes.Policy | EmptyObject | undefined,
    policyTags: OnyxTypes.PolicyTags,
    policyCategories: OnyxTypes.PolicyCategories,
) {
    // If the report is an iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = ReportUtils.isMoneyRequestReport(report);
    const currentChatReport = isMoneyRequestReport ? ReportUtils.getReport(report.chatReportID) : report;

    const optimisticReceipt: Receipt = {
        source: ReceiptGeneric as string,
        state: CONST.IOU.RECEIPT_STATE.OPEN,
    };
    const {iouReport, chatReport, transaction, iouAction, createdChatReportActionID, createdIOUReportActionID, reportPreviewAction, onyxData} = getMoneyRequestInformation(
        currentChatReport,
        participant,
        comment,
        amount,
        currency,
        created,
        merchant,
        optimisticReceipt,
        undefined,
        category,
        tag,
        billable,
        policy,
        policyTags,
        policyCategories,
        userAccountID,
        currentUserEmail,
    );

    type CreateDistanceRequestParams = {
        comment: string;
        iouReportID: string;
        chatReportID: string;
        transactionID: string;
        reportActionID: string;
        createdChatReportActionID: string;
        createdIOUReportActionID: string;
        reportPreviewReportActionID: string;
        waypoints: string;
        created: string;
        category?: string;
        tag?: string;
        billable?: boolean;
    };

    const parameters: CreateDistanceRequestParams = {
        comment,
        iouReportID: iouReport.reportID,
        chatReportID: chatReport.reportID,
        transactionID: transaction.transactionID,
        reportActionID: iouAction.reportActionID,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewReportActionID: reportPreviewAction.reportActionID,
        waypoints: JSON.stringify(validWaypoints),
        created,
        category,
        tag,
        billable,
    };

    API.write('CreateDistanceRequest', parameters, onyxData);
    Navigation.dismissModal(isMoneyRequestReport ? report.reportID : chatReport.reportID);
    Report.notifyNewAction(chatReport.reportID, userAccountID);
}

/**
 * @param transactionChanges
 * @param [transactionChanges.created] Present when updated the date field
 * @param onlyIncludeChangedFields
 *               When 'true', then the returned params will only include the transaction details for the fields that were changed.
 *               When `false`, then the returned params will include all the transaction details, regardless of which fields were changed.
 *               This setting is necessary while the UpdateDistanceRequest API is refactored to be fully 1:1:1 in https://github.com/Expensify/App/issues/28358
 */
function getUpdateMoneyRequestParams(
    transactionID: string,
    transactionThreadReportID: string,
    transactionChanges: TransactionChanges,
    onlyIncludeChangedFields: boolean,
): UpdateMoneyRequestData {
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    // Step 1: Set any "pending fields" (ones updated while the user was offline) to have error messages in the failureData
    const pendingFields = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE]));
    const clearedPendingFields = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, null]));
    const errorFields = Object.fromEntries(Object.keys(pendingFields).map((key) => [key, {[DateUtils.getMicroseconds()]: Localize.translateLocal('iou.error.genericEditFailureMessage')}]));

    // Step 2: Get all the collections being updated
    const transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.parentReportID}`] ?? null;
    const isFromExpenseReport = ReportUtils.isExpenseReport(iouReport);
    const updatedTransaction = transaction ? TransactionUtils.getUpdatedTransaction(transaction, transactionChanges, isFromExpenseReport) : null;
    const transactionDetails = ReportUtils.getTransactionDetails(updatedTransaction);

    if (transactionDetails?.waypoints) {
        // This needs to be a JSON string since we're sending this to the MapBox API
        transactionDetails.waypoints = JSON.stringify(transactionDetails.waypoints);
    }

    const dataToIncludeInParams: Partial<TransactionDetails> | undefined = onlyIncludeChangedFields
        ? Object.fromEntries(Object.entries(transactionDetails ?? {}).filter(([key]) => Object.keys(transactionChanges).includes(key)))
        : transactionDetails;

    const params: UpdateMoneyRequestParams = {
        ...dataToIncludeInParams,
        reportID: iouReport?.reportID,
        transactionID,
    };

    // Step 3: Build the modified expense report actions
    // We don't create a modified report action if we're updating the waypoints,
    // since there isn't actually any optimistic data we can create for them and the report action is created on the server
    // with the response from the MapBox API
    if (!('waypoints' in transactionChanges)) {
        const updatedReportAction = ReportUtils.buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, isFromExpenseReport);
        params.reportActionID = updatedReportAction.reportActionID;

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction as OnyxTypes.ReportAction,
            },
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    ...(updatedReportAction as OnyxTypes.ReportAction),
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericEditFailureMessage'),
                },
            },
        });

        // Step 4: Compute the IOU total and update the report preview message (and report header) so LHN amount owed is correct.
        // Should only update if the transaction matches the currency of the report, else we wait for the update
        // from the server with the currency conversion
        let updatedMoneyRequestReport = {...iouReport};
        if (updatedTransaction?.currency === iouReport?.currency && updatedTransaction?.modifiedAmount) {
            const diff = TransactionUtils.getAmount(transaction, true) - TransactionUtils.getAmount(updatedTransaction, true);
            if (ReportUtils.isExpenseReport(iouReport) && typeof updatedMoneyRequestReport.total === 'number') {
                updatedMoneyRequestReport.total += diff;
            } else {
                updatedMoneyRequestReport = iouReport
                    ? IOUUtils.updateIOUOwnerAndTotal(iouReport, updatedReportAction.actorAccountID ?? -1, diff, TransactionUtils.getCurrency(transaction), false)
                    : {};
            }

            updatedMoneyRequestReport.cachedTotal = CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedTransaction.currency);
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                value: updatedMoneyRequestReport,
            });
            successData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                value: {pendingAction: null},
            });
        }
    }

    // Optimistically modify the transaction
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...updatedTransaction,
            pendingFields,
            isLoading: 'waypoints' in transactionChanges,
            errorFields: null,
        },
    });

    // Update recently used categories if the category is changed
    if ('category' in transactionChanges) {
        // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
        const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(
            iouReport?.policyID,
            transactionChanges.category,
        ) as OptimisticPolicyRecentlyUsedCategories;
        if (optimisticPolicyRecentlyUsedCategories.length) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }
    }

    // Update recently used categories if the tag is changed
    if ('tag' in transactionChanges) {
        // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
        const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport?.policyID, transactionChanges.tag) as OptimisticPolicyRecentlyUsedTags;
        if (!isEmptyObject(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    }

    // Clear out the error fields and loading states on success
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields: null,
        },
    });

    if ('waypoints' in transactionChanges) {
        // Delete the draft transaction when editing waypoints when the server responds successfully and there are no errors
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`,
            value: null,
        });
    }

    // Clear out loading states, pending fields, and add the error fields
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields,
        },
    });

    if (iouReport) {
        // Reset the iouReport to it's original state
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: iouReport,
        });
    }

    return {
        params,
        onyxData: {optimisticData, successData, failureData},
    };
}

/**
 * Updates the created date of a money request
 */
function updateMoneyRequestDate(transactionID: string, transactionThreadReportID: string, val: string) {
    const transactionChanges: TransactionChanges = {
        created: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestDate', params, onyxData);
}

/** Updates the billable field of a money request */
function updateMoneyRequestBillable(transactionID: string, transactionThreadReportID: string, val: boolean) {
    const transactionChanges: TransactionChanges = {
        billable: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestBillable', params, onyxData);
}

/** Updates the merchant field of a money request */
function updateMoneyRequestMerchant(transactionID: string, transactionThreadReportID: string, val: string) {
    const transactionChanges: TransactionChanges = {
        merchant: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestMerchant', params, onyxData);
}

/** Updates the created date of a money request */
function updateMoneyRequestTag(transactionID: string, transactionThreadReportID: string, tag: string) {
    const transactionChanges: TransactionChanges = {
        tag,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestTag', params, onyxData);
}

/** Edits an existing distance request */
function updateDistanceRequest(transactionID: string, transactionThreadReportID: string, transactionChanges: TransactionChanges) {
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, false);
    API.write('UpdateDistanceRequest', params, onyxData);
}

/**
 * Request money from another user
 *
 * @param amount - always in the smallest unit of the currency
 */
function requestMoney(
    report: OnyxTypes.Report,
    amount: number,
    currency: string,
    created: string,
    merchant: string,
    payeeEmail: string,
    payeeAccountID: number,
    participant: Participant,
    comment: string,
    receipt: Receipt,
    category?: string,
    tag?: string,
    taxCode = '',
    taxAmount = 0,
    billable?: boolean,
    policy = undefined,
    policyTags = undefined,
    policyCategories = undefined,
) {
    // If the report is iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = ReportUtils.isMoneyRequestReport(report);
    const currentChatReport = isMoneyRequestReport ? ReportUtils.getReport(report.chatReportID) : report;
    const {payerAccountID, payerEmail, iouReport, chatReport, transaction, iouAction, createdChatReportActionID, createdIOUReportActionID, reportPreviewAction, onyxData} =
        getMoneyRequestInformation(
            currentChatReport,
            participant,
            comment,
            amount,
            currency,
            created,
            merchant,
            receipt,
            undefined,
            category,
            tag,
            billable,
            policy,
            policyTags,
            policyCategories,
            payeeAccountID,
            payeeEmail,
        );
    const activeReportID = isMoneyRequestReport ? report.reportID : chatReport.reportID;

    type RequestMoneyParams = {
        debtorEmail: string;
        debtorAccountID: number;
        amount: number;
        currency: string;
        comment: string;
        created: string;
        merchant: string;
        iouReportID: string;
        chatReportID: string;
        transactionID: string;
        reportActionID: string;
        createdChatReportActionID: string;
        createdIOUReportActionID: string;
        reportPreviewReportActionID: string;
        receipt: Receipt;
        receiptState?: ValueOf<typeof CONST.IOU.RECEIPT_STATE>;
        category?: string;
        tag?: string;
        taxCode: string;
        taxAmount: number;
        billable?: boolean;
    };

    const parameters: RequestMoneyParams = {
        debtorEmail: payerEmail,
        debtorAccountID: payerAccountID,
        amount,
        currency,
        comment,
        created,
        merchant,
        iouReportID: iouReport.reportID,
        chatReportID: chatReport.reportID,
        transactionID: transaction.transactionID,
        reportActionID: iouAction.reportActionID,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewReportActionID: reportPreviewAction.reportActionID,
        receipt,
        receiptState: receipt?.state,
        category,
        tag,
        taxCode,
        taxAmount,
        billable,
    };

    API.write('RequestMoney', parameters, onyxData);
    resetMoneyRequestInfo();
    Navigation.dismissModal(activeReportID);
    Report.notifyNewAction(activeReportID, payeeAccountID);
}

/**
 * Build the Onyx data and IOU split necessary for splitting a bill with 3+ users.
 * 1. Build the optimistic Onyx data for the group chat, i.e. chatReport and iouReportAction creating the former if it doesn't yet exist.
 * 2. Loop over the group chat participant list, building optimistic or updating existing chatReports, iouReports and iouReportActions between the user and each participant.
 * We build both Onyx data and the IOU split that is sent as a request param and is used by Auth to create the chatReports, iouReports and iouReportActions in the database.
 * The IOU split has the following shape:
 *  [
 *      {email: 'currentUser', amount: 100},
 *      {email: 'user2', amount: 100, iouReportID: '100', chatReportID: '110', transactionID: '120', reportActionID: '130'},
 *      {email: 'user3', amount: 100, iouReportID: '200', chatReportID: '210', transactionID: '220', reportActionID: '230'}
 *  ]
 * @param amount - always in the smallest unit of the currency
 * @param existingSplitChatReportID - the report ID where the split bill happens, could be a group chat or a workspace chat
 */
function createSplitsAndOnyxData(
    participants: Participant[],
    currentUserLogin: string,
    currentUserAccountID: number,
    amount: number,
    comment: string,
    currency: string,
    merchant: string,
    category: string,
    tag: string,
    existingSplitChatReportID = '',
): SplitsAndOnyxData {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = participants.map((participant) => Number(participant.accountID));
    const existingSplitChatReport =
        existingSplitChatReportID || participants[0].reportID
            ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${existingSplitChatReportID || participants[0].reportID}`]
            : ReportUtils.getChatByParticipants(participantAccountIDs);
    const splitChatReport = existingSplitChatReport ?? ReportUtils.buildOptimisticChatReport(participantAccountIDs);
    const isOwnPolicyExpenseChat = splitChatReport.isOwnPolicyExpenseChat;

    const splitTransaction = TransactionUtils.buildOptimisticTransaction(
        amount,
        currency,
        CONST.REPORT.SPLIT_REPORTID,
        comment,
        '',
        '',
        '',
        merchant || Localize.translateLocal('iou.request'),
        undefined,
        undefined,
        undefined,
        category,
        tag,
    );

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitCreatedReportAction = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        amount,
        currency,
        comment,
        participants,
        splitTransaction.transactionID,
        undefined,
        '',
        false,
        false,
        {},
        isOwnPolicyExpenseChat,
    );

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = splitIOUReportAction.message?.[0].text;
    splitChatReport.lastMessageHtml = splitIOUReportAction.message?.[0].html;

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData: OnyxUpdate[] = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        existingSplitChatReport
            ? {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitCreatedReportAction.reportActionID]: splitCreatedReportAction as OnyxTypes.ReportAction,
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: {},
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}},
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: {},
        },
    ];

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitIOUReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError(null),
                    },
                },
            },
        );
    }

    // Loop through participants creating individual chats, iouReports and reportActionIDs as needed
    const splitAmount = IOUUtils.calculateAmount(participants.length, amount, currency, false);
    const splits: Split[] = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID, amount: IOUUtils.calculateAmount(participants.length, amount, currency, true)}];

    const hasMultipleParticipants = participants.length > 1;
    participants.forEach((participant) => {
        // In a case when a participant is a workspace, even when a current user is not an owner of the workspace
        const isPolicyExpenseChat = ReportUtils.isPolicyExpenseChat(participant);

        // In case the participant is a workspace, email & accountID should remain undefined and won't be used in the rest of this code
        // participant.login is undefined when the request is initiated from a group DM with an unknown user, so we need to add a default
        const email = !!isOwnPolicyExpenseChat || isPolicyExpenseChat ? '' : OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login ?? '').toLowerCase();
        const accountID = !!isOwnPolicyExpenseChat || isPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // STEP 1: Get existing chat report OR build a new optimistic one
        // If we only have one participant and the request was initiated from the global create menu, i.e. !existingGroupChatReportID, the oneOnOneChatReport is the groupChatReport
        let oneOnOneChatReport: OptimisticChatReport;
        let isNewOneOnOneChatReport = false;
        let shouldCreateOptimisticPersonalDetails = false;
        const personalDetailExists = accountID in allPersonalDetails;

        // If this is a split between two people only and the function
        // wasn't provided with an existing group chat report id
        // or, if the split is being made from the workspace chat, then the oneOnOneChatReport is the same as the splitChatReport
        // in this case existingSplitChatReport will belong to the policy expense chat and we won't be
        // entering code that creates optimistic personal details
        if ((!hasMultipleParticipants && !existingSplitChatReportID) || isOwnPolicyExpenseChat) {
            oneOnOneChatReport = splitChatReport;
            shouldCreateOptimisticPersonalDetails = !existingSplitChatReport && !personalDetailExists;
        } else {
            const existingChatReport = ReportUtils.getChatByParticipants([accountID]);
            isNewOneOnOneChatReport = !existingChatReport;
            shouldCreateOptimisticPersonalDetails = isNewOneOnOneChatReport && !personalDetailExists;
            oneOnOneChatReport = existingChatReport ?? ReportUtils.buildOptimisticChatReport([accountID]);
        }

        // STEP 2: Get existing IOU/Expense report and update its total OR build a new optimistic one
        // For Control policy expense chats, if the report is already approved, create a new expense report
        let oneOnOneIOUReport: OneOnOneIOUReport = oneOnOneChatReport.iouReportID ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`] : null;
        const shouldCreateNewOneOnOneIOUReport =
            !oneOnOneIOUReport || (isOwnPolicyExpenseChat && ReportUtils.isControlPolicyExpenseReport(oneOnOneIOUReport) && ReportUtils.isReportApproved(oneOnOneIOUReport));

        if (!oneOnOneIOUReport || shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isOwnPolicyExpenseChat
                ? ReportUtils.buildOptimisticExpenseReport(oneOnOneChatReport.reportID, oneOnOneChatReport.policyID ?? '', currentUserAccountID, splitAmount, currency)
                : ReportUtils.buildOptimisticIOUReport(currentUserAccountID, accountID, splitAmount, oneOnOneChatReport.reportID, currency);
        } else if (isOwnPolicyExpenseChat) {
            if (typeof oneOnOneIOUReport?.total === 'number') {
                // Because of the Expense reports are stored as negative values, we subtract the total from the amount
                oneOnOneIOUReport.total -= splitAmount;
            }
        } else {
            oneOnOneIOUReport = IOUUtils.updateIOUOwnerAndTotal(oneOnOneIOUReport, currentUserAccountID, splitAmount, currency);
        }

        // STEP 3: Build optimistic transaction
        const oneOnOneTransaction = TransactionUtils.buildOptimisticTransaction(
            ReportUtils.isExpenseReport(oneOnOneIOUReport) ? -splitAmount : splitAmount,
            currency,
            oneOnOneIOUReport.reportID,
            comment,
            '',
            CONST.IOU.TYPE.SPLIT,
            splitTransaction.transactionID,
            merchant || Localize.translateLocal('iou.request'),
            undefined,
            undefined,
            undefined,
            category,
            tag,
        );

        // STEP 4: Build optimistic reportActions. We need:
        // 1. CREATED action for the chatReport
        // 2. CREATED action for the iouReport
        // 3. IOU action for the iouReport
        // 4. REPORTPREVIEW action for the chatReport
        // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
        const currentTime = DateUtils.getDBTime();
        const oneOnOneCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit, DateUtils.subtractMillisecondsFromDateTime(currentTime, 1));
        const oneOnOneIOUAction = ReportUtils.buildOptimisticIOUReportAction(
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            splitAmount,
            currency,
            comment,
            [participant],
            oneOnOneTransaction.transactionID,
            undefined,
            oneOnOneIOUReport.reportID,
            undefined,
            undefined,
            undefined,
            undefined,
            currentTime,
        );

        // Add optimistic personal details for new participants
        const oneOnOnePersonalDetailListAction: OnyxTypes.PersonalDetailsList = shouldCreateOptimisticPersonalDetails
            ? {
                  [accountID]: {
                      accountID,
                      avatar: UserUtils.getDefaultAvatarURL(accountID),
                      // Disabling this line since participant.displayName can be an empty string
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || email),
                      login: participant.login,
                      isOptimisticPersonalDetail: true,
                  },
              }
            : {};

        let oneOnOneReportPreviewAction = ReportActionsUtils.getReportPreviewAction(oneOnOneChatReport.reportID, oneOnOneIOUReport.reportID);
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = ReportUtils.updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = ReportUtils.buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport);
        }

        // Add category to optimistic policy recently used categories when a participant is a workspace
        const optimisticPolicyRecentlyUsedCategories = isPolicyExpenseChat
            ? // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
              (Policy.buildOptimisticPolicyRecentlyUsedCategories(participant.policyID, category) as OptimisticPolicyRecentlyUsedCategories)
            : [];

        // Add tag to optimistic policy recently used tags when a participant is a workspace
        const optimisticPolicyRecentlyUsedTags = isPolicyExpenseChat
            ? // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
              (Policy.buildOptimisticPolicyRecentlyUsedTags(participant.policyID, tag) as OptimisticPolicyRecentlyUsedTags)
            : {};

        // STEP 5: Build Onyx Data
        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest(
            oneOnOneChatReport,
            oneOnOneIOUReport,
            oneOnOneTransaction,
            oneOnOneCreatedActionForChat,
            oneOnOneCreatedActionForIOU,
            oneOnOneIOUAction,
            oneOnOnePersonalDetailListAction,
            oneOnOneReportPreviewAction,
            optimisticPolicyRecentlyUsedCategories,
            optimisticPolicyRecentlyUsedTags,
            isNewOneOnOneChatReport,
            !!shouldCreateNewOneOnOneIOUReport,
        );

        const individualSplit = {
            email,
            accountID,
            amount: splitAmount,
            iouReportID: oneOnOneIOUReport.reportID,
            chatReportID: oneOnOneChatReport.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
        };

        splits.push(individualSplit);
        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    const splitData: SplitData = {
        chatReportID: splitChatReport.reportID,
        transactionID: splitTransaction.transactionID,
        reportActionID: splitIOUReportAction.reportActionID,
        policyID: splitChatReport.policyID,
    };

    if (!existingSplitChatReport) {
        splitData.createdReportActionID = splitCreatedReportAction.reportActionID;
    }

    return {
        splitData,
        splits,
        onyxData: {optimisticData, successData, failureData},
    };
}

/**
 * @param amount - always in smallest currency unit
 * @param existingSplitChatReportID - Either a group DM or a workspace chat
 */
function splitBill(
    participants: Participant[],
    currentUserLogin: string,
    currentUserAccountID: number,
    amount: number,
    comment: string,
    currency: string,
    merchant: string,
    category: string,
    tag: string,
    existingSplitChatReportID = '',
) {
    const {splitData, splits, onyxData} = createSplitsAndOnyxData(
        participants,
        currentUserLogin,
        currentUserAccountID,
        amount,
        comment,
        currency,
        merchant,
        category,
        tag,
        existingSplitChatReportID,
    );

    type SplitBillParams = {
        reportID: string;
        amount: number;
        splits: string;
        comment: string;
        currency: string;
        merchant: string;
        category: string;
        tag: string;
        transactionID: string;
        reportActionID: string;
        createdReportActionID?: string;
        policyID?: string;
    };

    const parameters: SplitBillParams = {
        reportID: splitData.chatReportID,
        amount,
        splits: JSON.stringify(splits),
        currency,
        comment,
        category,
        merchant,
        tag,
        transactionID: splitData.transactionID,
        reportActionID: splitData.reportActionID,
        createdReportActionID: splitData.createdReportActionID,
        policyID: splitData.policyID,
    };

    API.write('SplitBill', parameters, onyxData);

    resetMoneyRequestInfo();
    Navigation.dismissModal();
    Report.notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/**
 * @param amount - always in smallest currency unit
 */
function splitBillAndOpenReport(
    participants: Participant[],
    currentUserLogin: string,
    currentUserAccountID: number,
    amount: number,
    comment: string,
    currency: string,
    merchant: string,
    category: string,
    tag: string,
) {
    const {splitData, splits, onyxData} = createSplitsAndOnyxData(participants, currentUserLogin, currentUserAccountID, amount, comment, currency, merchant, category, tag);

    type SplitBillAndOpenReport = {
        reportID: string;
        amount: number;
        splits: string;
        currency: string;
        merchant: string;
        comment: string;
        category: string;
        tag: string;
        transactionID: string;
        reportActionID: string;
        createdReportActionID?: string;
        policyID?: string;
    };

    const parameters: SplitBillAndOpenReport = {
        reportID: splitData.chatReportID,
        amount,
        splits: JSON.stringify(splits),
        currency,
        merchant,
        comment,
        category,
        tag,
        transactionID: splitData.transactionID,
        reportActionID: splitData.reportActionID,
        createdReportActionID: splitData.createdReportActionID,
        policyID: splitData.policyID,
    };

    API.write('SplitBillAndOpenReport', parameters, onyxData);

    resetMoneyRequestInfo();
    Navigation.dismissModal(splitData.chatReportID);
    Report.notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/** Used exclusively for starting a split bill request that contains a receipt, the split request will be completed once the receipt is scanned
 *  or user enters details manually.
 *
 * @param existingSplitChatReportID - Either a group DM or a workspace chat
 */
function startSplitBill(
    participants: Participant[],
    currentUserLogin: string,
    currentUserAccountID: number,
    comment: string,
    category: string,
    tag: string,
    receipt: Receipt,
    existingSplitChatReportID = '',
) {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = participants.map((participant) => Number(participant.accountID));
    const existingSplitChatReport =
        existingSplitChatReportID || participants[0].reportID
            ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${existingSplitChatReportID || participants[0].reportID}`]
            : ReportUtils.getChatByParticipants(participantAccountIDs);
    const splitChatReport = existingSplitChatReport ?? ReportUtils.buildOptimisticChatReport(participantAccountIDs);
    const isOwnPolicyExpenseChat = !!splitChatReport.isOwnPolicyExpenseChat;

    const {name: filename, source, state = CONST.IOU.RECEIPT_STATE.SCANREADY} = receipt;
    const receiptObject: Receipt = {state, source};

    // ReportID is -2 (aka "deleted") on the group transaction
    const splitTransaction = TransactionUtils.buildOptimisticTransaction(
        0,
        CONST.CURRENCY.USD,
        CONST.REPORT.SPLIT_REPORTID,
        comment,
        '',
        '',
        '',
        CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
        receiptObject,
        filename,
    );

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitChatCreatedReportAction = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        0,
        CONST.CURRENCY.USD,
        comment,
        participants,
        splitTransaction.transactionID,
        undefined,
        '',
        false,
        false,
        receiptObject,
        isOwnPolicyExpenseChat,
    );

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = splitIOUReportAction.message?.[0].text;
    splitChatReport.lastMessageHtml = splitIOUReportAction.message?.[0].html;

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData: OnyxUpdate[] = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        existingSplitChatReport
            ? {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitChatCreatedReportAction.reportActionID]: splitChatCreatedReportAction,
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitChatCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null},
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}},
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
    ];

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: getReceiptError(receipt, filename),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitChatCreatedReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                    [splitIOUReportAction.reportActionID]: {
                        errors: getReceiptError(receipt, filename),
                    },
                },
            },
        );
    }

    const splits: Split[] = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID}];

    participants.forEach((participant) => {
        // Disabling this line since participant.login can be an empty string
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const email = participant.isOwnPolicyExpenseChat ? '' : OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login || participant.text || '').toLowerCase();
        const accountID = participant.isOwnPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // When splitting with a workspace chat, we only need to supply the policyID and the workspace reportID as it's needed so we can update the report preview
        if (participant.isOwnPolicyExpenseChat) {
            splits.push({
                policyID: participant.policyID,
                chatReportID: splitChatReport.reportID,
            });
            return;
        }

        const participantPersonalDetails = allPersonalDetails[participant?.accountID ?? -1];
        if (!participantPersonalDetails) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.PERSONAL_DETAILS_LIST,
                value: {
                    [accountID]: {
                        accountID,
                        avatar: UserUtils.getDefaultAvatarURL(accountID),
                        // Disabling this line since participant.displayName can be an empty string
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || email),
                        // Disabling this line since participant.login can be an empty string
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        login: participant.login || participant.text,
                        isOptimisticPersonalDetail: true,
                    },
                },
            });
        }

        splits.push({
            email,
            accountID,
        });
    });

    // Save the new splits array into the transaction's comment in case the user calls CompleteSplitBill while offline
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
        value: {
            comment: {
                splits,
            },
        },
    });

    type StartSplitBillParams = {
        chatReportID: string;
        reportActionID: string;
        transactionID: string;
        splits: string;
        receipt: Receipt;
        comment: string;
        category: string;
        tag: string;
        isFromGroupDM: boolean;
        createdReportActionID?: string;
    };

    const parameters: StartSplitBillParams = {
        chatReportID: splitChatReport.reportID,
        reportActionID: splitIOUReportAction.reportActionID,
        transactionID: splitTransaction.transactionID,
        splits: JSON.stringify(splits),
        receipt,
        comment,
        category,
        tag,
        isFromGroupDM: !existingSplitChatReport,
        ...(existingSplitChatReport ? {} : {createdReportActionID: splitChatCreatedReportAction.reportActionID}),
    };

    API.write('StartSplitBill', parameters, {optimisticData, successData, failureData});

    resetMoneyRequestInfo();
    Navigation.dismissModal(splitChatReport.reportID);
    Report.notifyNewAction(splitChatReport.chatReportID ?? '', currentUserAccountID);
}

/** Used for editing a split bill while it's still scanning or when SmartScan fails, it completes a split bill started by startSplitBill above.
 *
 * @param chatReportID - The group chat or workspace reportID
 * @param reportAction - The split action that lives in the chatReport above
 * @param updatedTransaction - The updated **draft** split transaction
 * @param sessionAccountID - accountID of the current user
 * @param sessionEmail - email of the current user
 */
function completeSplitBill(chatReportID: string, reportAction: OnyxTypes.ReportAction, updatedTransaction: OnyxTypes.Transaction, sessionAccountID: number, sessionEmail: string) {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(sessionEmail);
    const {transactionID} = updatedTransaction;
    const unmodifiedTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];

    // Save optimistic updated transaction and action
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...updatedTransaction,
                receipt: {
                    state: CONST.IOU.RECEIPT_STATE.OPEN,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    lastModified: DateUtils.getDBTime(),
                    whisperedToAccountIDs: [],
                },
            },
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`,
            value: {pendingAction: null},
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...unmodifiedTransaction,
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                },
            },
        },
    ];

    const splitParticipants: Split[] = updatedTransaction.comment.splits ?? [];
    const {modifiedAmount: amount, modifiedCurrency: currency} = updatedTransaction;

    // Exclude the current user when calculating the split amount, `calculateAmount` takes it into account
    const splitAmount = IOUUtils.calculateAmount(splitParticipants.length - 1, amount ?? 0, currency ?? '', false);

    const splits: Split[] = [{email: currentUserEmailForIOUSplit}];
    splitParticipants.forEach((participant) => {
        // Skip creating the transaction for the current user
        if (participant.email === currentUserEmailForIOUSplit) {
            return;
        }
        const isPolicyExpenseChat = !!participant.policyID;

        if (!isPolicyExpenseChat) {
            // In case this is still the optimistic accountID saved in the splits array, return early as we cannot know
            // if there is an existing chat between the split creator and this participant
            // Instead, we will rely on Auth generating the report IDs and the user won't see any optimistic chats or reports created
            const participantPersonalDetails: OnyxTypes.PersonalDetails | EmptyObject = allPersonalDetails[participant?.accountID ?? -1] ?? {};
            if (!participantPersonalDetails || participantPersonalDetails.isOptimisticPersonalDetail) {
                splits.push({
                    email: participant.email,
                });
                return;
            }
        }

        let oneOnOneChatReport: OnyxTypes.Report | null;
        let isNewOneOnOneChatReport = false;
        if (isPolicyExpenseChat) {
            // The workspace chat reportID is saved in the splits array when starting a split bill with a workspace
            oneOnOneChatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.chatReportID}`] ?? null;
        } else {
            const existingChatReport = ReportUtils.getChatByParticipants(participant.accountID ? [participant.accountID] : []);
            isNewOneOnOneChatReport = !existingChatReport;
            oneOnOneChatReport = existingChatReport ?? ReportUtils.buildOptimisticChatReport(participant.accountID ? [participant.accountID] : []);
        }

        let oneOnOneIOUReport: OneOnOneIOUReport = oneOnOneChatReport?.iouReportID ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`] : null;
        const shouldCreateNewOneOnOneIOUReport =
            !oneOnOneIOUReport || (isPolicyExpenseChat && ReportUtils.isControlPolicyExpenseReport(oneOnOneIOUReport) && ReportUtils.isReportApproved(oneOnOneIOUReport));

        if (!oneOnOneIOUReport || shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isPolicyExpenseChat
                ? ReportUtils.buildOptimisticExpenseReport(oneOnOneChatReport?.reportID ?? '', participant.policyID ?? '', sessionAccountID, splitAmount, currency ?? '')
                : ReportUtils.buildOptimisticIOUReport(sessionAccountID, participant.accountID ?? -1, splitAmount, oneOnOneChatReport?.reportID ?? '', currency ?? '');
        } else if (isPolicyExpenseChat) {
            if (typeof oneOnOneIOUReport?.total === 'number') {
                // Because of the Expense reports are stored as negative values, we subtract the total from the amount
                oneOnOneIOUReport.total -= splitAmount;
            }
        } else {
            oneOnOneIOUReport = IOUUtils.updateIOUOwnerAndTotal(oneOnOneIOUReport, sessionAccountID, splitAmount, currency ?? '');
        }

        const oneOnOneTransaction = TransactionUtils.buildOptimisticTransaction(
            isPolicyExpenseChat ? -splitAmount : splitAmount,
            currency ?? '',
            oneOnOneIOUReport?.reportID ?? '',
            updatedTransaction.comment.comment,
            updatedTransaction.modifiedCreated,
            CONST.IOU.TYPE.SPLIT,
            transactionID,
            updatedTransaction.modifiedMerchant,
            {...updatedTransaction.receipt, state: CONST.IOU.RECEIPT_STATE.OPEN},
            updatedTransaction.filename,
        );

        const oneOnOneCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneIOUAction = ReportUtils.buildOptimisticIOUReportAction(
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            splitAmount,
            currency ?? '',
            updatedTransaction.comment.comment ?? '',
            [participant],
            oneOnOneTransaction.transactionID,
            undefined,
            oneOnOneIOUReport?.reportID,
        );

        let oneOnOneReportPreviewAction = ReportActionsUtils.getReportPreviewAction(oneOnOneChatReport?.reportID ?? '', oneOnOneIOUReport?.reportID ?? '');
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = ReportUtils.updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = ReportUtils.buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport, '', oneOnOneTransaction);
        }

        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest(
            oneOnOneChatReport,
            oneOnOneIOUReport,
            oneOnOneTransaction,
            oneOnOneCreatedActionForChat,
            oneOnOneCreatedActionForIOU,
            oneOnOneIOUAction,
            {},
            oneOnOneReportPreviewAction,
            [],
            {},
            isNewOneOnOneChatReport,
            shouldCreateNewOneOnOneIOUReport,
        );

        splits.push({
            email: participant.email,
            accountID: participant.accountID,
            policyID: participant.policyID,
            iouReportID: oneOnOneIOUReport?.reportID,
            chatReportID: oneOnOneChatReport?.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
        });

        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    const {
        amount: transactionAmount,
        currency: transactionCurrency,
        created: transactionCreated,
        merchant: transactionMerchant,
        comment: transactionComment,
        category: transactionCategory,
        tag: transactionTag,
    } = ReportUtils.getTransactionDetails(updatedTransaction) ?? {};

    type CompleteSplitBillParams = {
        transactionID: string;
        amount?: number;
        currency?: string;
        created?: string;
        merchant?: string;
        comment?: string;
        category?: string;
        tag?: string;
        splits: string;
    };

    const parameters: CompleteSplitBillParams = {
        transactionID,
        amount: transactionAmount,
        currency: transactionCurrency,
        created: transactionCreated,
        merchant: transactionMerchant,
        comment: transactionComment,
        category: transactionCategory,
        tag: transactionTag,
        splits: JSON.stringify(splits),
    };

    API.write('CompleteSplitBill', parameters, {optimisticData, successData, failureData});
    Navigation.dismissModal(chatReportID);
    Report.notifyNewAction(chatReportID, sessionAccountID);
}

function setDraftSplitTransaction(transactionID: string, transactionChanges: TransactionChanges = {}) {
    let draftSplitTransaction = allDraftSplitTransactions[`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`];

    if (!draftSplitTransaction) {
        draftSplitTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    }

    const updatedTransaction = draftSplitTransaction ? TransactionUtils.getUpdatedTransaction(draftSplitTransaction, transactionChanges, false, false) : null;

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`, updatedTransaction ?? {});
}

function editRegularMoneyRequest(transactionID: string, transactionThreadReportID: string, transactionChanges: TransactionChanges) {
    // STEP 1: Get all collections we're updating
    const transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.parentReportID}`] ?? null;
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${iouReport?.chatReportID}`] ?? null;
    const isFromExpenseReport = ReportUtils.isExpenseReport(iouReport);

    // STEP 2: Build new modified expense report action.
    const updatedReportAction = ReportUtils.buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, isFromExpenseReport);
    const updatedTransaction = transaction ? TransactionUtils.getUpdatedTransaction(transaction, transactionChanges, isFromExpenseReport) : null;

    // STEP 3: Compute the IOU total and update the report preview message so LHN amount owed is correct
    // Should only update if the transaction matches the currency of the report, else we wait for the update
    // from the server with the currency conversion
    let updatedMoneyRequestReport = {...iouReport};
    const updatedChatReport = {...chatReport};
    const diff = TransactionUtils.getAmount(transaction, true) - TransactionUtils.getAmount(updatedTransaction, true);
    if (updatedTransaction?.currency === iouReport?.currency && updatedTransaction?.modifiedAmount && diff !== 0) {
        if (ReportUtils.isExpenseReport(iouReport) && typeof updatedMoneyRequestReport.total === 'number') {
            updatedMoneyRequestReport.total += diff;
        } else {
            updatedMoneyRequestReport = iouReport
                ? IOUUtils.updateIOUOwnerAndTotal(iouReport, updatedReportAction.actorAccountID ?? -1, diff, TransactionUtils.getCurrency(transaction), false)
                : {};
        }

        updatedMoneyRequestReport.cachedTotal = CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedTransaction.currency);

        // Update the last message of the IOU report
        const lastMessage = ReportUtils.getIOUReportActionMessage(
            iouReport?.reportID ?? '',
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            updatedMoneyRequestReport.total ?? 0,
            '',
            updatedTransaction.currency,
            '',
            false,
        );
        updatedMoneyRequestReport.lastMessageText = lastMessage[0].text;
        updatedMoneyRequestReport.lastMessageHtml = lastMessage[0].html;

        // Update the last message of the chat report
        const hasNonReimbursableTransactions = ReportUtils.hasNonReimbursableTransactions(iouReport?.reportID);
        const messageText = Localize.translateLocal(hasNonReimbursableTransactions ? 'iou.payerSpentAmount' : 'iou.payerOwesAmount', {
            payer: ReportUtils.getPersonalDetailsForAccountID(updatedMoneyRequestReport.managerID ?? -1).login ?? '',
            amount: CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedMoneyRequestReport.currency),
        });
        updatedChatReport.lastMessageText = messageText;
        updatedChatReport.lastMessageHtml = messageText;
    }

    const isScanning = TransactionUtils.hasReceipt(updatedTransaction) && TransactionUtils.isReceiptBeingScanned(updatedTransaction);

    // STEP 4: Compose the optimistic data
    const currentTime = DateUtils.getDBTime();
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction as OnyxTypes.ReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: updatedTransaction ?? {},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: updatedMoneyRequestReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.chatReportID}`,
            value: updatedChatReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
            value: {
                lastReadTime: currentTime,
                lastVisibleActionCreated: currentTime,
            },
        },
    ];

    if (!isScanning) {
        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
                value: {
                    [transactionThread?.parentReportActionID ?? '']: {
                        whisperedToAccountIDs: [],
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.parentReportID}`,
                value: {
                    [iouReport?.parentReportActionID ?? '']: {
                        whisperedToAccountIDs: [],
                    },
                },
            },
        );
    }

    // Update recently used categories if the category is changed
    if ('category' in transactionChanges) {
        // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
        const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(
            iouReport?.policyID,
            transactionChanges.category,
        ) as OptimisticPolicyRecentlyUsedCategories;
        if (optimisticPolicyRecentlyUsedCategories.length) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }
    }

    // Update recently used categories if the tag is changed
    if ('tag' in transactionChanges) {
        // TODO: Remove assertion once Policy.js (https://github.com/Expensify/App/issues/24918) is migrated to TypeScript.
        const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport?.policyID, transactionChanges.tag) as OptimisticPolicyRecentlyUsedTags;
        if (!isEmptyObject(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingFields: {
                    comment: null,
                    amount: null,
                    created: null,
                    currency: null,
                    merchant: null,
                    billable: null,
                    category: null,
                    tag: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {pendingAction: null},
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericEditFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...transaction,
                modifiedCreated: transaction?.modifiedCreated ? transaction.modifiedCreated : null,
                modifiedAmount: transaction?.modifiedAmount ? transaction.modifiedAmount : null,
                modifiedCurrency: transaction?.modifiedCurrency ? transaction.modifiedCurrency : null,
                modifiedMerchant: transaction?.modifiedMerchant ? transaction.modifiedMerchant : null,
                modifiedWaypoints: transaction?.modifiedWaypoints ? transaction.modifiedWaypoints : null,
                pendingFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                ...iouReport,
                cachedTotal: iouReport?.cachedTotal ? iouReport?.cachedTotal : null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.chatReportID}`,
            value: chatReport ?? {},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
            value: {
                lastReadTime: transactionThread?.lastReadTime,
                lastVisibleActionCreated: transactionThread?.lastVisibleActionCreated,
            },
        },
    ];

    // STEP 6: Call the API endpoint
    const {created, amount, currency, comment, merchant, category, billable, tag} = ReportUtils.getTransactionDetails(updatedTransaction) ?? {};

    type EditMoneyRequestParams = {
        transactionID: string;
        reportActionID: string;
        created?: string;
        amount?: number;
        currency?: string;
        comment?: string;
        merchant?: string;
        category?: string;
        billable?: boolean;
        tag?: string;
    };

    const parameters: EditMoneyRequestParams = {
        transactionID,
        reportActionID: updatedReportAction.reportActionID,
        created,
        amount,
        currency,
        comment,
        merchant,
        category,
        billable,
        tag,
    };

    API.write('EditMoneyRequest', parameters, {optimisticData, successData, failureData});
}

function editMoneyRequest(transaction: OnyxTypes.Transaction, transactionThreadReportID: string, transactionChanges: TransactionChanges) {
    if (TransactionUtils.isDistanceRequest(transaction)) {
        updateDistanceRequest(transaction.transactionID, transactionThreadReportID, transactionChanges);
    } else {
        editRegularMoneyRequest(transaction.transactionID, transactionThreadReportID, transactionChanges);
    }
}

/**
 * Updates the amount and currency fields of a money request
 */
function updateMoneyRequestAmountAndCurrency(transactionID: string, transactionThreadReportID: string, currency: string, amount: number) {
    const transactionChanges = {
        amount,
        currency,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestAmountAndCurrency', params, onyxData);
}

function deleteMoneyRequest(transactionID: string, reportAction: OnyxTypes.ReportAction, isSingleTransactionView = false) {
    // STEP 1: Get all collections we're updating
    const iouReportID = reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.IOU ? reportAction.originalMessage.IOUReportID : '';
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${iouReportID}`] ?? null;
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${iouReport?.chatReportID}`];
    const reportPreviewAction = ReportActionsUtils.getReportPreviewAction(iouReport?.chatReportID ?? '', iouReport?.reportID ?? '');
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`];
    const transactionThreadID = reportAction.childReportID;
    let transactionThread = null;
    if (transactionThreadID) {
        transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`] ?? null;
    }

    // STEP 2: Decide if we need to:
    // 1. Delete the transactionThread - delete if there are no visible comments in the thread
    // 2. Update the moneyRequestPreview to show [Deleted request] - update if the transactionThread exists AND it isn't being deleted
    const shouldDeleteTransactionThread = transactionThreadID ? (reportAction?.childVisibleActionCount ?? 0) === 0 : false;
    const shouldShowDeletedRequestMessage = !!transactionThreadID && !shouldDeleteTransactionThread;

    // STEP 3: Update the IOU reportAction and decide if the iouReport should be deleted. We delete the iouReport if there are no visible comments left in the report.
    const updatedReportAction = {
        [reportAction.reportActionID]: {
            pendingAction: shouldShowDeletedRequestMessage ? CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE : CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            previousMessage: reportAction.message,
            message: [
                {
                    type: 'COMMENT',
                    html: '',
                    text: '',
                    isEdited: true,
                    isDeletedParentAction: shouldShowDeletedRequestMessage,
                },
            ],
            originalMessage: {
                IOUTransactionID: null,
            },
            errors: undefined,
        },
    } as OnyxTypes.ReportActions;

    const lastVisibleAction = ReportActionsUtils.getLastVisibleAction(iouReport?.reportID ?? '', updatedReportAction);
    const iouReportLastMessageText = ReportActionsUtils.getLastVisibleMessage(iouReport?.reportID ?? '', updatedReportAction).lastMessageText;
    const shouldDeleteIOUReport =
        iouReportLastMessageText.length === 0 && !ReportActionsUtils.isDeletedParentAction(lastVisibleAction) && (!transactionThreadID || shouldDeleteTransactionThread);

    // STEP 4: Update the iouReport and reportPreview with new totals and messages if it wasn't deleted
    let updatedIOUReport: OnyxTypes.Report | null;
    const updatedReportPreviewAction: OnyxTypes.ReportAction | EmptyObject = {...reportPreviewAction};
    updatedReportPreviewAction.pendingAction = shouldDeleteIOUReport ? CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE : CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE;
    if (iouReport && ReportUtils.isExpenseReport(iouReport)) {
        updatedIOUReport = {...iouReport};

        if (typeof updatedIOUReport.total === 'number') {
            // Because of the Expense reports are stored as negative values, we add the total from the amount
            updatedIOUReport.total += TransactionUtils.getAmount(transaction, true);
        }
    } else {
        updatedIOUReport = IOUUtils.updateIOUOwnerAndTotal(
            iouReport,
            reportAction.actorAccountID ?? -1,
            TransactionUtils.getAmount(transaction, false),
            TransactionUtils.getCurrency(transaction),
            true,
        );
    }

    if (updatedIOUReport) {
        updatedIOUReport.lastMessageText = iouReportLastMessageText;
        updatedIOUReport.lastVisibleActionCreated = lastVisibleAction?.created;
    }

    const hasNonReimbursableTransactions = ReportUtils.hasNonReimbursableTransactions(iouReport?.reportID);
    const messageText = Localize.translateLocal(hasNonReimbursableTransactions ? 'iou.payerSpentAmount' : 'iou.payerOwesAmount', {
        payer: ReportUtils.getPersonalDetailsForAccountID(updatedIOUReport?.managerID ?? -1).login ?? '',
        amount: CurrencyUtils.convertToDisplayString(updatedIOUReport?.total, updatedIOUReport?.currency),
    });

    if (updatedReportPreviewAction?.message?.[0]) {
        updatedReportPreviewAction.message[0].text = messageText;
        updatedReportPreviewAction.message[0].html = messageText;
    }

    if (updatedReportPreviewAction && reportPreviewAction?.childMoneyRequestCount && reportPreviewAction?.childMoneyRequestCount > 0) {
        updatedReportPreviewAction.childMoneyRequestCount = reportPreviewAction.childMoneyRequestCount - 1;
    }

    // STEP 5: Build Onyx data
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: null,
        },
    ];

    if (Permissions.canUseViolations(betas)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: null,
        });
    }

    if (shouldDeleteTransactionThread) {
        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                value: null,
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadID}`,
                value: null,
            },
        );
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: updatedReportAction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: updatedIOUReport ?? {},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction?.reportActionID ?? '']: updatedReportPreviewAction,
            },
        },
    );

    if (!shouldDeleteIOUReport && updatedReportPreviewAction.childMoneyRequestCount === 0) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: false,
            },
        });
    }

    if (shouldDeleteIOUReport) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: false,
                iouReportID: null,
                lastMessageText: ReportActionsUtils.getLastVisibleMessage(iouReport?.chatReportID ?? '', {[reportPreviewAction?.reportActionID ?? '']: null})?.lastMessageText,
                lastVisibleActionCreated: ReportActionsUtils.getLastVisibleAction(iouReport?.chatReportID ?? '', {[reportPreviewAction?.reportActionID ?? '']: null})?.created,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: shouldDeleteIOUReport
                    ? null
                    : {
                          pendingAction: null,
                      },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction?.reportActionID ?? '']: shouldDeleteIOUReport
                    ? null
                    : {
                          pendingAction: null,
                          errors: null,
                      },
            },
        },
    ];

    if (shouldDeleteIOUReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: null,
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: transaction,
        },
    ];

    if (Permissions.canUseViolations(betas)) {
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: transactionViolations,
        });
    }

    if (shouldDeleteTransactionThread) {
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
            value: transactionThread,
        });
    }

    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericDeleteFailureMessage'),
                },
            },
        },
        shouldDeleteIOUReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                  value: iouReport,
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                  value: iouReport ?? {},
              },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction?.reportActionID ?? '']: {
                    ...reportPreviewAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericDeleteFailureMessage'),
                },
            },
        },
    );

    if (chatReport && shouldDeleteIOUReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: chatReport,
        });
    }

    if (!shouldDeleteIOUReport && updatedReportPreviewAction.childMoneyRequestCount === 0) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: true,
            },
        });
    }

    type DeleteMoneyRequestParams = {
        transactionID: string;
        reportActionID: string;
    };

    const parameters: DeleteMoneyRequestParams = {
        transactionID,
        reportActionID: reportAction.reportActionID,
    };

    // STEP 6: Make the API request
    API.write('DeleteMoneyRequest', parameters, {optimisticData, successData, failureData});

    // STEP 7: Navigate the user depending on which page they are on and which resources were deleted
    if (iouReport && isSingleTransactionView && shouldDeleteTransactionThread && !shouldDeleteIOUReport) {
        // Pop the deleted report screen before navigating. This prevents navigating to the Concierge chat due to the missing report.
        Navigation.goBack(ROUTES.REPORT_WITH_ID.getRoute(iouReport.reportID));
        return;
    }

    if (iouReport?.chatReportID && shouldDeleteIOUReport) {
        // Pop the deleted report screen before navigating. This prevents navigating to the Concierge chat due to the missing report.
        Navigation.goBack(ROUTES.REPORT_WITH_ID.getRoute(iouReport.chatReportID));
    }
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function getSendMoneyParams(
    report: OnyxTypes.Report,
    amount: number,
    currency: string,
    comment: string,
    paymentMethodType: PaymentMethodType,
    managerID: number,
    recipient: Participant,
): SendMoneyParamsData {
    const recipientEmail = OptionsListUtils.addSMSDomainIfPhoneNumber(recipient.login ?? '');
    const recipientAccountID = Number(recipient.accountID);
    const newIOUReportDetails = JSON.stringify({
        amount,
        currency,
        requestorEmail: recipientEmail,
        requestorAccountID: recipientAccountID,
        comment,
        idempotencyKey: Str.guid(),
    });

    let chatReport = report.reportID ? report : null;
    let isNewChat = false;
    if (!chatReport) {
        chatReport = ReportUtils.getChatByParticipants([recipientAccountID]);
    }
    if (!chatReport) {
        chatReport = ReportUtils.buildOptimisticChatReport([recipientAccountID]);
        isNewChat = true;
    }
    const optimisticIOUReport = ReportUtils.buildOptimisticIOUReport(recipientAccountID, managerID, amount, chatReport.reportID, currency, true);

    const optimisticTransaction = TransactionUtils.buildOptimisticTransaction(amount, currency, optimisticIOUReport.reportID, comment);
    const optimisticTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
        value: optimisticTransaction,
    };

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const optimisticCreatedAction = ReportUtils.buildOptimisticCreatedReportAction(recipientEmail);
    const optimisticIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.PAY,
        amount,
        currency,
        comment,
        [recipient],
        optimisticTransaction.transactionID,
        paymentMethodType,
        optimisticIOUReport.reportID,
        false,
        true,
    );

    const reportPreviewAction = ReportUtils.buildOptimisticReportPreview(chatReport, optimisticIOUReport);

    // Change the method to set for new reports because it doesn't exist yet, is faster,
    // and we need the data to be available when we navigate to the chat page
    const optimisticChatReportData: OnyxUpdate = isNewChat
        ? {
              onyxMethod: Onyx.METHOD.SET,
              key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
              value: {
                  ...chatReport,
                  // Set and clear pending fields on the chat report
                  pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
                  lastReadTime: DateUtils.getDBTime(),
                  lastVisibleActionCreated: reportPreviewAction.created,
              },
          }
        : {
              onyxMethod: Onyx.METHOD.MERGE,
              key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
              value: {
                  ...chatReport,
                  lastReadTime: DateUtils.getDBTime(),
                  lastVisibleActionCreated: reportPreviewAction.created,
              },
          };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticIOUReport.reportID}`,
        value: {
            ...optimisticIOUReport,
            lastMessageText: optimisticIOUReportAction.message?.[0].text,
            lastMessageHtml: optimisticIOUReportAction.message?.[0].html,
        },
    };
    const optimisticIOUReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
        value: {
            [optimisticIOUReportAction.reportActionID]: {
                ...(optimisticIOUReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticChatReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
        value: {
            [reportPreviewAction.reportActionID]: reportPreviewAction,
        },
    };

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
            },
        },
    ];

    let optimisticPersonalDetailListData: OnyxUpdate | EmptyObject = {};

    // Now, let's add the data we need just when we are creating a new chat report
    if (isNewChat) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {pendingFields: null},
        });
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
                value: {
                    [optimisticIOUReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError(null),
                    },
                },
            },
        );

        // Add optimistic personal details for recipient
        optimisticPersonalDetailListData = {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: {
                [recipientAccountID]: {
                    accountID: recipientAccountID,
                    avatar: UserUtils.getDefaultAvatarURL(recipient.accountID),
                    // Disabling this line since participant.displayName can be an empty string
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    displayName: recipient.displayName || recipient.login,
                    login: recipient.login,
                },
            },
        };

        // Add an optimistic created action to the optimistic chat reportActions data
        optimisticChatReportActionsData.value[optimisticCreatedAction.reportActionID] = optimisticCreatedAction;
    } else {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        });
    }

    const optimisticData: OnyxUpdate[] = [optimisticChatReportData, optimisticIOUReportData, optimisticChatReportActionsData, optimisticIOUReportActionsData, optimisticTransactionData];
    if (!isEmptyObject(optimisticPersonalDetailListData)) {
        optimisticData.push(optimisticPersonalDetailListData);
    }

    return {
        params: {
            iouReportID: optimisticIOUReport.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
            transactionID: optimisticTransaction.transactionID,
            newIOUReportDetails,
            createdReportActionID: isNewChat ? optimisticCreatedAction.reportActionID : '',
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
        },
        optimisticData,
        successData,
        failureData,
    };
}

function getPayMoneyRequestParams(chatReport: OnyxTypes.Report, iouReport: OnyxTypes.Report, recipient: Participant, paymentMethodType: PaymentMethodType): PayMoneyRequestData {
    const optimisticIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.PAY,
        -(iouReport.total ?? 0),
        iouReport.currency ?? '',
        '',
        [recipient],
        '',
        paymentMethodType,
        iouReport.reportID,
        true,
    );

    // In some instances, the report preview action might not be available to the payer (only whispered to the requestor)
    // hence we need to make the updates to the action safely.
    let optimisticReportPreviewAction = null;
    const reportPreviewAction = ReportActionsUtils.getReportPreviewAction(chatReport.reportID, iouReport.reportID);
    if (reportPreviewAction) {
        optimisticReportPreviewAction = ReportUtils.updateReportPreview(iouReport, reportPreviewAction, true);
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`] ?? null;

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                ...chatReport,
                lastReadTime: DateUtils.getDBTime(),
                lastVisibleActionCreated: optimisticIOUReportAction.created,
                hasOutstandingChildRequest: false,
                iouReportID: null,
                lastMessageText: optimisticIOUReportAction.message?.[0].text,
                lastMessageHtml: optimisticIOUReportAction.message?.[0].html,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    ...(optimisticIOUReportAction as OnyxTypes.ReportAction),
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                ...iouReport,
                lastMessageText: optimisticIOUReportAction.message?.[0].text,
                lastMessageHtml: optimisticIOUReportAction.message?.[0].html,
                hasOutstandingChildRequest: false,
                statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.NVP_LAST_PAYMENT_METHOD,
            value: {[iouReport.policyID ?? '']: paymentMethodType},
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: iouReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: chatReport,
        },
    ];

    if (currentNextStep !== null) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`,
            value: currentNextStep,
        });
    }

    // In case the report preview action is loaded locally, let's update it.
    if (optimisticReportPreviewAction) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: optimisticReportPreviewAction,
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: {
                    created: optimisticReportPreviewAction.created,
                },
            },
        });
    }

    return {
        params: {
            iouReportID: iouReport.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
        },
        optimisticData,
        successData,
        failureData,
    };
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function sendMoneyElsewhere(report: OnyxTypes.Report, amount: number, currency: string, comment: string, managerID: number, recipient: Participant) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.ELSEWHERE, managerID, recipient);

    API.write('SendMoneyElsewhere', params, {optimisticData, successData, failureData});

    resetMoneyRequestInfo();
    Navigation.dismissModal(params.chatReportID);
    Report.notifyNewAction(params.chatReportID, managerID);
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function sendMoneyWithWallet(report: OnyxTypes.Report, amount: number, currency: string, comment: string, managerID: number, recipient: Participant) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.EXPENSIFY, managerID, recipient);

    API.write('SendMoneyWithWallet', params, {optimisticData, successData, failureData});

    resetMoneyRequestInfo();
    Navigation.dismissModal(params.chatReportID);
    Report.notifyNewAction(params.chatReportID, managerID);
}

function approveMoneyRequest(expenseReport: OnyxTypes.Report) {
    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;

    const optimisticApprovedReportAction = ReportUtils.buildOptimisticApprovedReportAction(expenseReport.total ?? 0, expenseReport.currency ?? '', expenseReport.reportID);

    const optimisticReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticApprovedReportAction.reportActionID]: {
                ...(optimisticApprovedReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: {
            ...expenseReport,
            lastMessageText: optimisticApprovedReportAction.message?.[0].text,
            lastMessageHtml: optimisticApprovedReportAction.message?.[0].html,
            stateNum: CONST.REPORT.STATE_NUM.APPROVED,
            statusNum: CONST.REPORT.STATUS_NUM.APPROVED,
        },
    };
    const optimisticData: OnyxUpdate[] = [optimisticIOUReportData, optimisticReportActionsData];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticApprovedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [expenseReport.reportActionID ?? '']: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
    ];

    if (currentNextStep) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        });
    }

    type ApproveMoneyRequestParams = {
        reportID: string;
        approvedReportActionID: string;
    };

    const parameters: ApproveMoneyRequestParams = {
        reportID: expenseReport.reportID,
        approvedReportActionID: optimisticApprovedReportAction.reportActionID,
    };

    API.write('ApproveMoneyRequest', parameters, {optimisticData, successData, failureData});
}

function submitReport(expenseReport: OnyxTypes.Report) {
    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;

    const optimisticSubmittedReportAction = ReportUtils.buildOptimisticSubmittedReportAction(expenseReport?.total ?? 0, expenseReport.currency ?? '', expenseReport.reportID);
    const parentReport = ReportUtils.getReport(expenseReport.parentReportID);
    const isCurrentUserManager = currentUserPersonalDetails.accountID === expenseReport.managerID;

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    ...(optimisticSubmittedReportAction as OnyxTypes.ReportAction),
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                ...expenseReport,
                lastMessageText: optimisticSubmittedReportAction.message?.[0].text ?? '',
                lastMessageHtml: optimisticSubmittedReportAction.message?.[0].html ?? '',
                stateNum: CONST.REPORT.STATE_NUM.SUBMITTED,
                statusNum: CONST.REPORT.STATUS_NUM.SUBMITTED,
            },
        },
    ];

    if (parentReport?.reportID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
            value: {
                ...parentReport,
                // In case its a manager who force submitted the report, they are the next user who needs to take an action
                hasOutstandingChildRequest: isCurrentUserManager,
                iouReportID: null,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                statusNum: CONST.REPORT.STATUS_NUM.OPEN,
                stateNum: CONST.REPORT.STATE_NUM.OPEN,
            },
        },
    ];

    if (parentReport?.reportID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
            value: {
                hasOutstandingChildRequest: parentReport.hasOutstandingChildRequest,
                iouReportID: expenseReport.reportID,
            },
        });
    }

    if (currentNextStep) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        });
    }

    type SubmitReportParams = {
        reportID: string;
        managerAccountID?: number;
        reportActionID: string;
    };

    const parameters: SubmitReportParams = {
        reportID: expenseReport.reportID,
        managerAccountID: expenseReport.managerID,
        reportActionID: optimisticSubmittedReportAction.reportActionID,
    };

    API.write('SubmitReport', parameters, {optimisticData, successData, failureData});
}

function cancelPayment(expenseReport: OnyxTypes.Report, chatReport: OnyxEntry<OnyxTypes.Report>) {
    const optimisticReportAction = ReportUtils.buildOptimisticCancelPaymentReportAction(expenseReport.reportID);
    const policy = ReportUtils.getPolicy(chatReport?.policyID);
    const isFree = policy && policy.type === CONST.POLICY.TYPE.FREE;
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReportAction.reportActionID]: {
                    ...(optimisticReportAction as OnyxTypes.ReportAction),
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                ...expenseReport,
                lastMessageText: optimisticReportAction.message?.[0]?.text ?? '',
                lastMessageHtml: optimisticReportAction.message?.[0]?.html ?? '',
                stateNum: isFree ? CONST.REPORT.STATE_NUM.SUBMITTED : CONST.REPORT.STATE_NUM.OPEN,
                statusNum: isFree ? CONST.REPORT.STATUS_NUM.SUBMITTED : CONST.REPORT.STATUS_NUM.OPEN,
            },
        },
    ];

    if (chatReport?.reportID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                ...chatReport,
                hasOutstandingIOU: true,
                hasOutstandingChildRequest: true,
                iouReportID: expenseReport.reportID,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [expenseReport.reportActionID ?? '']: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED,
            },
        },
    ];

    if (chatReport?.reportID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                hasOutstandingIOU: false,
                hasOutstandingChildRequest: false,
                iouReportID: '0',
            },
        });
    }

    type CancelPaymentParams = {
        iouReportID: string;
        chatReportID?: string;
        managerAccountID?: number;
        reportActionID: string;
    };

    const parameters: CancelPaymentParams = {
        iouReportID: expenseReport.reportID,
        chatReportID: chatReport?.reportID,
        managerAccountID: expenseReport.managerID,
        reportActionID: optimisticReportAction.reportActionID,
    };

    API.write('CancelPayment', parameters, {optimisticData, successData, failureData});
}

function payMoneyRequest(paymentType: PaymentMethodType, chatReport: OnyxTypes.Report, iouReport: OnyxTypes.Report) {
    const recipient = {accountID: iouReport.ownerAccountID};
    const {params, optimisticData, successData, failureData} = getPayMoneyRequestParams(chatReport, iouReport, recipient, paymentType);

    // For now we need to call the PayMoneyRequestWithWallet API since PayMoneyRequest was not updated to work with
    // Expensify Wallets.
    const apiCommand = paymentType === CONST.IOU.PAYMENT_TYPE.EXPENSIFY ? 'PayMoneyRequestWithWallet' : 'PayMoneyRequest';

    API.write(apiCommand, params, {optimisticData, successData, failureData});
    Navigation.dismissModal(chatReport.reportID);
}

function detachReceipt(transactionID: string) {
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const newTransaction = transaction ? {...transaction, filename: '', receipt: {}} : null;

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: newTransaction,
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: transaction ?? {},
        },
    ];

    API.write('DetachReceipt', {transactionID}, {optimisticData, failureData});
}

function replaceReceipt(transactionID: string, file: File, source: string) {
    const transaction = allTransactions.transactionID;
    const oldReceipt = transaction?.receipt ?? {};

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: {
                    source,
                    state: CONST.IOU.RECEIPT_STATE.OPEN,
                },
                filename: file.name,
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: oldReceipt,
                filename: transaction?.filename,
            },
        },
    ];

    type ReplaceReceiptParams = {
        transactionID: string;
        receipt: File;
    };

    const parameters: ReplaceReceiptParams = {
        transactionID,
        receipt: file,
    };

    API.write('ReplaceReceipt', parameters, {optimisticData, failureData});
}

/**
 * Finds the participants for an IOU based on the attached report
 * @param transactionID of the transaction to set the participants of
 * @param report attached to the transaction
 */
function setMoneyRequestParticipantsFromReport(transactionID: string, report: OnyxTypes.Report) {
    // If the report is iou or expense report, we should get the chat report to set participant for request money
    const chatReport = ReportUtils.isMoneyRequestReport(report) ? ReportUtils.getReport(report.chatReportID) : report;
    const currentUserAccountID = currentUserPersonalDetails.accountID;
    const participants: Participant[] = ReportUtils.isPolicyExpenseChat(chatReport)
        ? [{reportID: chatReport?.reportID, isPolicyExpenseChat: true, selected: true}]
        : (chatReport?.participantAccountIDs ?? []).filter((accountID) => currentUserAccountID !== accountID).map((accountID) => ({accountID, selected: true}));

    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {participants, participantsAutoAssigned: true});
}

/**
 * Initialize money request info and navigate to the MoneyRequest page
 */
function startMoneyRequest(iouType: string, reportID = '') {
    resetMoneyRequestInfo(`${iouType}${reportID}`);
    Navigation.navigate(ROUTES.MONEY_REQUEST.getRoute(iouType, reportID));
}

function setMoneyRequestId(id: string) {
    Onyx.merge(ONYXKEYS.IOU, {id});
}

function setMoneyRequestAmount(amount: number) {
    Onyx.merge(ONYXKEYS.IOU, {amount});
}

function setMoneyRequestCreated(created: string) {
    Onyx.merge(ONYXKEYS.IOU, {created});
}

function setMoneyRequestCurrency(currency: string) {
    Onyx.merge(ONYXKEYS.IOU, {currency});
}

function setMoneyRequestDescription(comment: string) {
    Onyx.merge(ONYXKEYS.IOU, {comment: comment.trim()});
}

function setMoneyRequestMerchant(merchant: string) {
    Onyx.merge(ONYXKEYS.IOU, {merchant: merchant.trim()});
}

function setMoneyRequestCategory(category: string) {
    Onyx.merge(ONYXKEYS.IOU, {category});
}

function resetMoneyRequestCategory() {
    Onyx.merge(ONYXKEYS.IOU, {category: ''});
}

function setMoneyRequestTag(tag: string) {
    Onyx.merge(ONYXKEYS.IOU, {tag});
}

function resetMoneyRequestTag() {
    Onyx.merge(ONYXKEYS.IOU, {tag: ''});
}

function setMoneyRequestTaxRate(transactionID: string, taxRate: TaxRate) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxRate});
}

function setMoneyRequestTaxAmount(transactionID: string, taxAmount: number) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxAmount});
}

function setMoneyRequestBillable(billable: boolean) {
    Onyx.merge(ONYXKEYS.IOU, {billable});
}

function setMoneyRequestParticipants(participants: Participant[], isSplitRequest?: boolean) {
    Onyx.merge(ONYXKEYS.IOU, {participants, isSplitRequest});
}

function setUpDistanceTransaction() {
    const transactionID = NumberUtils.rand64();
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        transactionID,
        comment: {type: CONST.TRANSACTION.TYPE.CUSTOM_UNIT, customUnit: {name: CONST.CUSTOM_UNITS.NAME_DISTANCE}},
    });
    Onyx.merge(ONYXKEYS.IOU, {transactionID});
}

/**
 * Navigates to the next IOU page based on where the IOU request was started
 */
function navigateToNextPage(iou: OnyxEntry<OnyxTypes.IOU>, iouType: string, report?: OnyxTypes.Report, path = '') {
    const moneyRequestID = `${iouType}${report?.reportID ?? ''}`;
    const shouldReset = iou?.id !== moneyRequestID && !!report?.reportID;

    // If the money request ID in Onyx does not match the ID from params, we want to start a new request
    // with the ID from params. We need to clear the participants in case the new request is initiated from FAB.
    if (shouldReset) {
        resetMoneyRequestInfo(moneyRequestID);
    }

    // If we're adding a receipt, that means the user came from the confirmation page and we need to navigate back to it.
    if (path.slice(1) === ROUTES.MONEY_REQUEST_RECEIPT.getRoute(iouType, report?.reportID)) {
        Navigation.navigate(ROUTES.MONEY_REQUEST_CONFIRMATION.getRoute(iouType, report?.reportID));
        return;
    }

    // If a request is initiated on a report, skip the participants selection step and navigate to the confirmation page.
    if (report?.reportID) {
        // If the report is iou or expense report, we should get the chat report to set participant for request money
        const chatReport = ReportUtils.isMoneyRequestReport(report) ? ReportUtils.getReport(report.chatReportID) : report;
        // Reinitialize the participants when the money request ID in Onyx does not match the ID from params
        if (!iou?.participants?.length || shouldReset) {
            const currentUserAccountID = currentUserPersonalDetails.accountID;
            const participants: Participant[] = ReportUtils.isPolicyExpenseChat(chatReport)
                ? [{reportID: chatReport?.reportID, isPolicyExpenseChat: true, selected: true}]
                : (chatReport?.participantAccountIDs ?? []).filter((accountID) => currentUserAccountID !== accountID).map((accountID) => ({accountID, selected: true}));
            setMoneyRequestParticipants(participants);
            resetMoneyRequestCategory();
            resetMoneyRequestTag();
        }
        Navigation.navigate(ROUTES.MONEY_REQUEST_CONFIRMATION.getRoute(iouType, report.reportID));
        return;
    }
    Navigation.navigate(ROUTES.MONEY_REQUEST_PARTICIPANTS.getRoute(iouType));
}

/**
 *  When the money request or split bill creation flow is initialized via FAB, the reportID is not passed as a navigation
 * parameter.
 * Gets a report id from the first participant of the IOU object stored in Onyx.
 */
function getIOUReportID(iou?: OnyxTypes.IOU, route?: MoneyRequestRoute): string {
    // Disabling this line for safeness as nullish coalescing works only if the value is undefined or null
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return route?.params.reportID || iou?.participants?.[0]?.reportID || '';
}

export {
    setMoneyRequestParticipants,
    createDistanceRequest,
    deleteMoneyRequest,
    splitBill,
    splitBillAndOpenReport,
    setDraftSplitTransaction,
    startSplitBill,
    completeSplitBill,
    requestMoney,
    sendMoneyElsewhere,
    approveMoneyRequest,
    submitReport,
    payMoneyRequest,
    sendMoneyWithWallet,
    startMoneyRequest,
    startMoneyRequest_temporaryForRefactor,
    resetMoneyRequestCategory,
    resetMoneyRequestCategory_temporaryForRefactor,
    resetMoneyRequestInfo,
    resetMoneyRequestTag,
    resetMoneyRequestTag_temporaryForRefactor,
    clearMoneyRequest,
    setMoneyRequestAmount_temporaryForRefactor,
    setMoneyRequestBillable_temporaryForRefactor,
    setMoneyRequestCategory_temporaryForRefactor,
    setMoneyRequestCreated_temporaryForRefactor,
    setMoneyRequestCurrency_temporaryForRefactor,
    setMoneyRequestDescription_temporaryForRefactor,
    setMoneyRequestMerchant_temporaryForRefactor,
    setMoneyRequestParticipants_temporaryForRefactor,
    setMoneyRequestReceipt,
    setMoneyRequestTag_temporaryForRefactor,
    setMoneyRequestAmount,
    setMoneyRequestBillable,
    setMoneyRequestCategory,
    setMoneyRequestCreated,
    setMoneyRequestCurrency,
    setMoneyRequestDescription,
    setMoneyRequestId,
    setMoneyRequestMerchant,
    setMoneyRequestParticipantsFromReport,
    setMoneyRequestTag,
    setMoneyRequestTaxAmount,
    setMoneyRequestTaxRate,
    setUpDistanceTransaction,
    navigateToNextPage,
    updateMoneyRequestDate,
    updateMoneyRequestBillable,
    updateMoneyRequestMerchant,
    updateMoneyRequestTag,
    updateMoneyRequestAmountAndCurrency,
    replaceReceipt,
    detachReceipt,
    getIOUReportID,
    editMoneyRequest,
    cancelPayment,
};
