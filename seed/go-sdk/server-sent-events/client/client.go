// This file was auto-generated by Fern from our API Definition.

package client

import (
	completions "github.com/server-sent-events/fern/completions"
	core "github.com/server-sent-events/fern/core"
	option "github.com/server-sent-events/fern/option"
	http "net/http"
)

type Client struct {
	baseURL string
	caller  *core.Caller
	header  http.Header

	Completions *completions.Client
}

func NewClient(opts ...option.RequestOption) *Client {
	options := core.NewRequestOptions(opts...)
	return &Client{
		baseURL: options.BaseURL,
		caller: core.NewCaller(
			&core.CallerParams{
				Client:      options.HTTPClient,
				MaxAttempts: options.MaxAttempts,
			},
		),
		header:      options.ToHeader(),
		Completions: completions.NewClient(opts...),
	}
}
