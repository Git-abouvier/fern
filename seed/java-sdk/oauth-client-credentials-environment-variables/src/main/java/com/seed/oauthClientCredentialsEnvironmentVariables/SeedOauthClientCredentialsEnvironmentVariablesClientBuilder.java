/**
 * This file was auto-generated by Fern from our API Definition.
 */
package com.seed.oauthClientCredentialsEnvironmentVariables;

import com.seed.oauthClientCredentialsEnvironmentVariables.core.ClientOptions;
import com.seed.oauthClientCredentialsEnvironmentVariables.core.Environment;

public final class SeedOauthClientCredentialsEnvironmentVariablesClientBuilder {
    private ClientOptions.Builder clientOptionsBuilder = ClientOptions.builder();

    private String token = null;

    private Environment environment;

    /**
     * Sets token
     */
    public SeedOauthClientCredentialsEnvironmentVariablesClientBuilder token(String token) {
        this.token = token;
        return this;
    }

    public SeedOauthClientCredentialsEnvironmentVariablesClientBuilder url(String url) {
        this.environment = Environment.custom(url);
        return this;
    }

    public SeedOauthClientCredentialsEnvironmentVariablesClient build() {
        this.clientOptionsBuilder.addHeader("Authorization", "Bearer " + this.token);
        clientOptionsBuilder.environment(this.environment);
        return new SeedOauthClientCredentialsEnvironmentVariablesClient(clientOptionsBuilder.build());
    }
}
