package com.songhg.firefly.iot.api.dto.openapi;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class OpenApiRegistrationSyncDTO {

    @NotBlank
    @Size(max = 32)
    private String serviceCode;

    @Valid
    private List<OpenApiRegistrationItemDTO> items = new ArrayList<>();
}
