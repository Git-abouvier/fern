/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as FernIr from "../../..";

/**
 * If set, the endpoint will be generated with auto-pagination features.
 *
 * The page must be defined as a query parameter included in the request,
 * whereas the next page and results are resolved from properties defined
 * on the response.
 */
export interface CursorPagination {
    page: FernIr.QueryParameter;
    next: FernIr.ResponseProperty;
    results: FernIr.ResponseProperty;
}
